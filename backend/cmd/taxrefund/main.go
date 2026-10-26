// Command taxrefund runs the refund status backend.
//
//	taxrefund serve           HTTP API (runs migrations first unless MIGRATE_ON_START=false)
//	taxrefund process         screen new returns and transmit them to the agencies
//	taxrefund batch-run [j]   one batch status run for jurisdiction j (default: all), then exit
//	taxrefund batch-schedule  batch runs on a fixed interval (dev and Docker Compose)
//	taxrefund agency          a mock tax agency API (AGENCY=irs or ca-ftb)
//	taxrefund migrate         apply migrations and seed demo users, then exit
//	taxrefund all             everything above in one process, including both agency mocks
//	taxrefund healthcheck     exit 0 if the local API answers (for distroless health checks)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"

	"taxrefund/internal/agency"
	"taxrefund/internal/agencymock"
	"taxrefund/internal/api"
	"taxrefund/internal/auth"
	"taxrefund/internal/batch"
	"taxrefund/internal/config"
	"taxrefund/internal/processor"
	"taxrefund/internal/store"
	"taxrefund/internal/telemetry"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

// app holds what every command shares and closes it all on exit.
type app struct {
	cfg       config.Config
	shutdowns []func(context.Context) error
}

func (a *app) provider(ctx context.Context, service string) (telemetry.Provider, error) {
	p, err := telemetry.NewProvider(ctx, service, a.cfg.Env)
	if err == nil {
		a.shutdowns = append(a.shutdowns, p.Shutdown)
	}
	return p, err
}

func (a *app) close() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, f := range a.shutdowns {
		if err := f(ctx); err != nil {
			slog.Warn("telemetry shutdown", "err", err)
		}
	}
}

func run() error {
	cmd := "all"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	if cmd == "healthcheck" {
		return healthcheck()
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	var handler slog.Handler = slog.NewJSONHandler(os.Stdout, nil)
	if cfg.Env == "dev" {
		handler = slog.NewTextHandler(os.Stdout, nil)
	}
	slog.SetDefault(slog.New(handler))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	a := &app{cfg: cfg}
	defer a.close()

	switch cmd {
	case "agency":
		p, err := a.provider(ctx, "agency-"+cfg.Mock.Agency)
		if err != nil {
			return err
		}
		telemetry.Init(p)
		return a.serveMock(ctx, cfg.Mock, p)
	case "migrate":
		if err := cfg.RequireDatabase(); err != nil {
			return err
		}
		p, err := a.provider(ctx, "refund-migrate")
		if err != nil {
			return err
		}
		pool, err := store.Connect(ctx, cfg.DatabaseURL, p)
		if err != nil {
			return err
		}
		defer pool.Close()
		return migrate(ctx, pool, cfg)
	case "serve":
		return a.withService(ctx, "refund-api", func(ctx context.Context, pool *pgxpool.Pool, p telemetry.Provider) error {
			if cfg.MigrateOnStart {
				if err := migrate(ctx, pool, cfg); err != nil {
					return err
				}
			}
			return serve(ctx, pool, cfg, p)
		})
	case "process":
		return a.withService(ctx, "refund-processor", func(ctx context.Context, pool *pgxpool.Pool, p telemetry.Provider) error {
			clients, err := agencyClients(cfg, p, 1)
			if err != nil {
				return err
			}
			return processor.New(pool, cfg, clients, p).Run(ctx)
		})
	case "batch-run":
		return a.withService(ctx, "refund-batch", func(ctx context.Context, pool *pgxpool.Pool, p telemetry.Provider) error {
			clients, err := agencyClients(cfg, p, cfg.BatchShards)
			if err != nil {
				return err
			}
			runner := batch.NewRunner(pool, cfg, clients, p)
			if len(os.Args) > 2 {
				sum, err := runner.Run(ctx, os.Args[2], "cron")
				slog.Info("batch run finished", "run", sum.RunID, "jurisdiction", sum.Jurisdiction, "status", sum.Status,
					"checked", sum.Checked, "changed", sum.Changed, "chunks_failed", sum.ChunksFailed)
				return err
			}
			return runner.RunAll(ctx, "cron")
		})
	case "batch-schedule":
		return a.withService(ctx, "refund-batch", func(ctx context.Context, pool *pgxpool.Pool, p telemetry.Provider) error {
			clients, err := agencyClients(cfg, p, cfg.BatchShards)
			if err != nil {
				return err
			}
			return batch.NewRunner(pool, cfg, clients, p).Schedule(ctx)
		})
	case "all":
		return a.runAll(ctx)
	default:
		return fmt.Errorf("unknown command %q (want serve, process, batch-run, batch-schedule, agency, migrate, or all)", cmd)
	}
}

// withService sets up tracing as the named service, connects to Postgres, and runs fn.
func (a *app) withService(ctx context.Context, service string, fn func(context.Context, *pgxpool.Pool, telemetry.Provider) error) error {
	if err := a.cfg.RequireDatabase(); err != nil {
		return err
	}
	p, err := a.provider(ctx, service)
	if err != nil {
		return err
	}
	telemetry.Init(p)
	pool, err := store.Connect(ctx, a.cfg.DatabaseURL, p)
	if err != nil {
		return err
	}
	defer pool.Close()
	return fn(ctx, pool, p)
}

// runAll runs every service in one process for debugging. Each gets its own tracer provider
// and connection pool, so Jaeger shows them as separate services just as in Kubernetes.
func (a *app) runAll(ctx context.Context) error {
	cfg := a.cfg
	if err := cfg.RequireDatabase(); err != nil {
		return err
	}
	g, ctx := errgroup.WithContext(ctx)

	for _, m := range []struct{ agency, addr string }{{"irs", ":9101"}, {"ca-ftb", ":9102"}} {
		mc := cfg.Mock
		mc.Agency, mc.Addr = m.agency, m.addr
		p, err := a.provider(ctx, "agency-"+m.agency)
		if err != nil {
			return err
		}
		g.Go(func() error { return a.serveMock(ctx, mc, p) })
	}

	type svc struct {
		name string
		run  func(context.Context, *pgxpool.Pool, telemetry.Provider) error
	}
	services := []svc{
		{"refund-api", func(ctx context.Context, pool *pgxpool.Pool, p telemetry.Provider) error {
			if err := migrate(ctx, pool, cfg); err != nil {
				return err
			}
			return serve(ctx, pool, cfg, p)
		}},
		{"refund-processor", func(ctx context.Context, pool *pgxpool.Pool, p telemetry.Provider) error {
			clients, err := agencyClients(cfg, p, 1)
			if err != nil {
				return err
			}
			return processor.New(pool, cfg, clients, p).Run(ctx)
		}},
		{"refund-batch", func(ctx context.Context, pool *pgxpool.Pool, p telemetry.Provider) error {
			clients, err := agencyClients(cfg, p, cfg.BatchShards)
			if err != nil {
				return err
			}
			return batch.NewRunner(pool, cfg, clients, p).Schedule(ctx)
		}},
	}
	for i, s := range services {
		p, err := a.provider(ctx, s.name)
		if err != nil {
			return err
		}
		if i == 0 {
			telemetry.Init(p)
		}
		pool, err := store.Connect(ctx, cfg.DatabaseURL, p)
		if err != nil {
			return err
		}
		defer pool.Close()
		g.Go(func() error { return s.run(ctx, pool, p) })
	}
	return g.Wait()
}

// agencyClients builds one client per jurisdiction. The agency's rate limit is shared by all
// shards, so each process gets its slice of it.
func agencyClients(cfg config.Config, p telemetry.Provider, shards int) (map[string]*agency.Client, error) {
	if err := cfg.RequireAgencies(); err != nil {
		return nil, err
	}
	clients := map[string]*agency.Client{}
	for _, j := range agency.Jurisdictions {
		clients[j.Code] = agency.NewClient(j, cfg.AgencyURLs[j.Agency], cfg.AgencyAPIKey, cfg.AgencyRPS/float64(shards), p)
	}
	return clients, nil
}

func migrate(ctx context.Context, pool *pgxpool.Pool, cfg config.Config) error {
	if err := store.Migrate(ctx, pool); err != nil {
		return err
	}
	if cfg.SeedDemoUsers {
		return store.SeedDemoUsers(ctx, pool, auth.HashPassword)
	}
	return nil
}

func serve(ctx context.Context, pool *pgxpool.Pool, cfg config.Config, p telemetry.Provider) error {
	authSvc, err := auth.NewService(pool, cfg.SessionTTL, cfg.CookieSecure)
	if err != nil {
		return err
	}
	// The admin UI talks to the mock agencies' operator endpoints. Without agency settings the
	// API still serves taxpayers; admin actions report the agency as unavailable.
	clients := map[string]*agency.Client{}
	if cfg.RequireAgencies() == nil {
		if clients, err = agencyClients(cfg, p, 1); err != nil {
			return err
		}
		for _, c := range clients {
			c.WithAdminKey(cfg.AgencyAdminKey)
		}
	} else {
		slog.Warn("agency settings missing; admin actions are unavailable")
	}
	return listen(ctx, "api", cfg.Addr, api.New(pool, authSvc, cfg, clients, p).Handler())
}

// serveMock runs a mock agency. With DATABASE_URL set, operators can override statuses
// (stored in the agency_mock schema); without it the mock follows its automatic timeline only.
func (a *app) serveMock(ctx context.Context, mc config.MockConfig, p telemetry.Provider) error {
	cfg := a.cfg
	if cfg.AgencyAPIKey == "" {
		return errors.New("AGENCY_API_KEY is required")
	}
	var overrides *agencymock.Overrides
	if cfg.DatabaseURL != "" {
		pool, err := store.Connect(ctx, cfg.DatabaseURL, p)
		if err != nil {
			return err
		}
		defer pool.Close()
		if overrides, err = agencymock.NewOverrides(ctx, pool); err != nil {
			return err
		}
	} else {
		slog.Warn("DATABASE_URL not set; status overrides are disabled", "agency", mc.Agency)
	}
	m := agencymock.New(agencymock.Config{
		Agency: mc.Agency, APIKey: cfg.AgencyAPIKey, AdminKey: cfg.AgencyAdminKey, ProcessAfter: mc.ProcessAfter,
		ApproveAfter: mc.ApproveAfter, SendAfter: mc.SendAfter, ErrorRate: mc.ErrorRate, Latency: mc.Latency,
	}, overrides, p)
	return listen(ctx, "agency-"+mc.Agency, mc.Addr, m.Handler())
}

func listen(ctx context.Context, name, addr string, h http.Handler) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdown)
	}()
	slog.Info("listening", "service", name, "addr", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// healthcheck GETs the local health endpoint: /api/healthz on ADDR, or /healthz on
// AGENCY_ADDR when run as `healthcheck agency`.
func healthcheck() error {
	addr, path := os.Getenv("ADDR"), "/api/healthz"
	if len(os.Args) > 2 && os.Args[2] == "agency" {
		addr, path = os.Getenv("AGENCY_ADDR"), "/healthz"
		if addr == "" {
			addr = ":9100"
		}
	}
	if addr == "" {
		addr = ":8080"
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1" + addr[strings.LastIndex(addr, ":"):] + path)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s returned %d", path, resp.StatusCode)
	}
	return nil
}
