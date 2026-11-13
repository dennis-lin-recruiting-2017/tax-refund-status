// Package store owns the Postgres connection pool, schema migrations, and demo seed data.
package store

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/trace"
)

//go:embed migrations/*.sql
var migrations embed.FS

//go:embed demo-users.json
var demoUsers []byte

// Arbitrary constant so concurrent pods don't run migrations at the same time.
const migrationLockID = 727274

// Connect opens a pool whose queries are traced with tp. Spans carry the SQL text but never
// the parameter values, so no taxpayer data reaches the tracing backend.
func Connect(ctx context.Context, url string, tp trace.TracerProvider) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 10
	cfg.ConnConfig.Tracer = otelpgx.NewTracer(otelpgx.WithTracerProvider(tp), otelpgx.WithTrimSQLInSpanName(), otelpgx.WithDisableAcquireTracer())

	// Retry while Postgres starts up (common in Docker and Kubernetes).
	deadline := time.Now().Add(60 * time.Second)
	for {
		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				return pool, nil
			}
			pool.Close()
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("connect to postgres: %w", err)
		}
		slog.Info("waiting for postgres", "err", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", migrationLockID); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), "SELECT pg_advisory_unlock($1)", migrationLockID)

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}

	files, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)

	for _, file := range files {
		var applied bool
		if err := conn.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", file).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		sql, err := migrations.ReadFile(file)
		if err != nil {
			return err
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("apply %s: %w", file, err)
		}
		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", file); err != nil {
			tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		slog.Info("applied migration", "file", file)
	}
	slog.Info("migrations up to date", "count", len(files))
	return nil
}

type DemoUser struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	FullName   string `json:"fullName"`
	TaxIDLast4 string `json:"taxIdLast4"`
	Role       string `json:"role"`
	// Where the user lives and works. A single "state" in the seed file means a full resident of
	// it; "states": [] means no state at all, so the user files only the federal return.
	State  string       `json:"state,omitempty"`
	States []DemoFiling `json:"states"`
	// Drafts are pre-filled forms, by form ID, that the portal loads so a tester can review and
	// submit without typing. They're demo fixtures served from this embedded file and never
	// stored in the database.
	Drafts map[string]json.RawMessage `json:"drafts,omitempty"`
}

type DemoFiling struct {
	State     string `json:"state"`
	Residency string `json:"residency"`
}

// Filings returns the user's states. A user with neither "state" nor "states" defaults to a
// California resident.
func (u DemoUser) Filings() []DemoFiling {
	if u.States != nil {
		return u.States
	}
	if u.State == "" {
		return []DemoFiling{{"CA", "resident"}}
	}
	return []DemoFiling{{u.State, "resident"}}
}

// DemoUsers returns the accounts defined in demo-users.json.
func DemoUsers() ([]DemoUser, error) {
	var users []DemoUser
	return users, json.Unmarshal(demoUsers, &users)
}

// DemoDraft returns the pre-filled form for a demo user, if the seed file has one.
func DemoDraft(email, form string) (json.RawMessage, bool) {
	users, err := DemoUsers()
	if err != nil {
		return nil, false
	}
	for _, u := range users {
		if strings.EqualFold(u.Email, email) {
			d, ok := u.Drafts[form]
			return d, ok
		}
	}
	return nil, false
}

// SeedDemoUsers creates or updates the users in demo-users.json.
func SeedDemoUsers(ctx context.Context, pool *pgxpool.Pool, hash func(string) (string, error)) error {
	users, err := DemoUsers()
	if err != nil {
		return err
	}
	for _, u := range users {
		h, err := hash(u.Password)
		if err != nil {
			return err
		}
		if u.Role == "" {
			u.Role = "taxpayer"
		}
		// Demo accounts always match the seed file, so editing it and restarting is enough.
		err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
			var id string
			if err := tx.QueryRow(ctx, `INSERT INTO users (email, password_hash, full_name, tax_id_last4, role)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name,
					tax_id_last4 = EXCLUDED.tax_id_last4, role = EXCLUDED.role, failed_logins = 0, locked_until = NULL
				RETURNING id`,
				u.Email, h, u.FullName, u.TaxIDLast4, u.Role).Scan(&id); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, "DELETE FROM user_states WHERE user_id = $1", id); err != nil {
				return err
			}
			for _, f := range u.Filings() {
				if _, err := tx.Exec(ctx, "INSERT INTO user_states (user_id, state, residency) VALUES ($1, $2, $3)",
					id, f.State, f.Residency); err != nil {
					return fmt.Errorf("%s in %s: %w", u.Email, f.State, err)
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	slog.Info("seeded demo users", "count", len(users))
	return nil
}
