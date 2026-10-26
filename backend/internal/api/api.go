// Package api serves the JSON HTTP API used by the portal.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/trace"

	"taxrefund/internal/agency"
	"taxrefund/internal/auth"
	"taxrefund/internal/config"
)

type Server struct {
	pool     *pgxpool.Pool
	auth     *auth.Service
	cfg      config.Config
	login    *auth.RateLimiter
	tp       trace.TracerProvider
	agencies map[string]*agency.Client // by jurisdiction; used by the admin endpoints
}

func New(pool *pgxpool.Pool, authSvc *auth.Service, cfg config.Config, agencies map[string]*agency.Client, tp trace.TracerProvider) *Server {
	return &Server{pool: pool, auth: authSvc, cfg: cfg, login: auth.NewRateLimiter(10, 5*time.Minute), tp: tp, agencies: agencies}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/readyz", s.ready)

	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)

	protected := http.NewServeMux()
	protected.HandleFunc("GET /api/auth/me", s.handleMe)
	protected.HandleFunc("GET /api/returns", s.handleListReturns)
	protected.HandleFunc("POST /api/returns/{form}/estimate", s.handleEstimate)
	protected.HandleFunc("POST /api/returns/{form}", s.handleSubmit)
	protected.HandleFunc("DELETE /api/returns", s.handleReset)
	admin := http.NewServeMux()
	s.adminRoutes(admin)
	protected.Handle("/api/admin/", auth.RequireAdmin(admin))
	mux.Handle("/api/", s.auth.Require(protected))

	// One span per request, named by method and path. Health checks aren't traced.
	return otelhttp.NewHandler(logRequests(securityHeaders(requireCSRFHeader(mux))), "api",
		otelhttp.WithTracerProvider(s.tp),
		otelhttp.WithFilter(func(r *http.Request) bool { return !strings.HasSuffix(r.URL.Path, "z") }),
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string { return r.Method + " " + r.URL.Path }),
	)
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.pool.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ready"})
}

// --- helpers ---

const maxBodyBytes = 16 << 10

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "The request couldn't be read.")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) internalError(w http.ResponseWriter, r *http.Request, err error) {
	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	writeError(w, http.StatusInternalServerError, "Something went wrong. Try again in a moment.")
}

func clientIP(r *http.Request) string {
	// Behind nginx/ingress the first X-Forwarded-For entry is the client.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) audit(ctx context.Context, r *http.Request, userID *string, action string, detail map[string]any) {
	if detail == nil {
		detail = map[string]any{}
	}
	ip := clientIP(r)
	var ipArg any
	if net.ParseIP(ip) != nil {
		ipArg = ip
	}
	if _, err := s.pool.Exec(ctx, "INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1, $2, $3, $4)",
		userID, action, detail, ipArg); err != nil {
		slog.Error("audit write failed", "action", action, "err", err)
	}
}

// --- middleware ---

// requireCSRFHeader forces cross-site requests through a CORS preflight, which this API never
// approves. Together with SameSite=Strict cookies this blocks cross-site request forgery.
func requireCSRFHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if r.Header.Get("X-Requested-With") != "fetch" {
				writeError(w, http.StatusForbidden, "Missing request header.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// logRequests logs method, path, status, duration, and trace ID. Bodies are never logged.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		if r.URL.Path == "/api/healthz" || r.URL.Path == "/api/readyz" {
			return
		}
		attrs := []any{"method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", time.Since(start).Milliseconds()}
		if sc := trace.SpanContextFromContext(r.Context()); sc.IsValid() {
			attrs = append(attrs, "trace_id", sc.TraceID().String())
		}
		slog.Info("request", attrs...)
	})
}

var errNotFound = errors.New("not found")
