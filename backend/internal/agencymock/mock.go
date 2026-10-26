// Package agencymock simulates a tax agency's e-file and refund status API (the IRS or a
// state). Real agencies don't offer a public API like this; the demo needs something to call.
//
// By default a submission follows an automatic timeline: the submission ID encodes when the
// return was received and whether it has a refund, and status is computed from elapsed time.
// A demo operator can pin any submission to a status through the admin endpoints; those
// overrides live in Postgres, so every replica agrees and restarts lose nothing.
package agencymock

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	"taxrefund/internal/agency"
)

type Config struct {
	Agency       string        // e.g. "irs"; prefixes submission IDs
	APIKey       string        // callers must send "Authorization: Bearer <key>"
	AdminKey     string        // separate key for the operator endpoints that change statuses
	ProcessAfter time.Duration // received -> processing
	ApproveAfter time.Duration // -> approved (or accepted when nothing is refunded)
	SendAfter    time.Duration // approved -> sent
	ErrorRate    float64       // fraction of status calls that fail with 503, to exercise retries
	Latency      time.Duration // simulated base latency per call
}

type Mock struct {
	cfg       Config
	tp        trace.TracerProvider
	overrides *Overrides // nil: automatic timeline only
}

func New(cfg Config, overrides *Overrides, tp trace.TracerProvider) *Mock {
	return &Mock{cfg: cfg, tp: tp, overrides: overrides}
}

// Statuses an operator may set. action_required means the agency needs more information
// from the taxpayer (for example, an identity verification letter).
var settable = map[string]bool{
	"received": true, "processing": true, "approved": true, "sent": true, "accepted": true, "action_required": true,
}

func (m *Mock) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"status":"ok"}`)) })
	mux.Handle("POST /v1/returns", m.auth(http.HandlerFunc(m.submit)))
	mux.Handle("POST /v1/statuses/batch-get", m.auth(http.HandlerFunc(m.batchGet)))
	mux.Handle("PUT /v1/admin/submissions/{id}", m.adminAuth(http.HandlerFunc(m.setOverride)))
	mux.Handle("DELETE /v1/admin/submissions/{id}", m.adminAuth(http.HandlerFunc(m.clearOverride)))
	return otelhttp.NewHandler(mux, m.cfg.Agency,
		otelhttp.WithTracerProvider(m.tp),
		otelhttp.WithFilter(func(r *http.Request) bool { return r.URL.Path != "/healthz" }),
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string { return r.Method + " " + r.URL.Path }),
	)
}

func (m *Mock) auth(next http.Handler) http.Handler { return bearer(m.cfg.APIKey, next) }

func (m *Mock) adminAuth(next http.Handler) http.Handler {
	if m.cfg.AdminKey == "" || m.overrides == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"admin endpoints are disabled"}`, http.StatusNotFound)
		})
	}
	return bearer(m.cfg.AdminKey, next)
}

func bearer(key string, next http.Handler) http.Handler {
	want := []byte("Bearer " + key)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), want) != 1 {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (m *Mock) simulateLatency(n int) {
	if m.cfg.Latency > 0 {
		jitter := time.Duration(rand.Int64N(int64(m.cfg.Latency)))
		time.Sleep(m.cfg.Latency + jitter + time.Duration(n)*200*time.Microsecond)
	}
}

func (m *Mock) submit(w http.ResponseWriter, r *http.Request) {
	var req agency.SubmitRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil || req.Reference == "" {
		http.Error(w, `{"error":"invalid submission"}`, http.StatusBadRequest)
		return
	}
	m.simulateLatency(1)
	now := time.Now().UTC()
	kind := "o"
	if req.RefundCents > 0 {
		kind = "r"
	}
	// <agency>-<received unix ms>-<r|o>-<reference digest>
	digest := hmac.New(sha256.New, []byte(m.cfg.Agency))
	digest.Write([]byte(req.Reference))
	id := fmt.Sprintf("%s-%d-%s-%s", m.cfg.Agency, now.UnixMilli(), kind, hex.EncodeToString(digest.Sum(nil))[:10])
	trace.SpanFromContext(r.Context()).SetAttributes(attribute.String("agency.submission_id", id))
	writeJSON(w, http.StatusCreated, agency.SubmitResponse{SubmissionID: id, Status: "received", ReceivedAt: now})
}

func (m *Mock) batchGet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SubmissionIDs []string `json:"submissionIds"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if len(req.SubmissionIDs) > agency.MaxBatch {
		http.Error(w, `{"error":"too many submission IDs"}`, http.StatusRequestEntityTooLarge)
		return
	}
	span := trace.SpanFromContext(r.Context())
	span.SetAttributes(attribute.Int("agency.batch_size", len(req.SubmissionIDs)))
	m.simulateLatency(len(req.SubmissionIDs))
	if rand.Float64() < m.cfg.ErrorRate {
		span.SetAttributes(attribute.Bool("agency.simulated_error", true))
		w.Header().Set("Retry-After", "1")
		http.Error(w, `{"error":"temporarily unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	var overrides map[string]Override
	if m.overrides != nil {
		var err error
		if overrides, err = m.overrides.Get(r.Context(), req.SubmissionIDs); err != nil {
			slog.Error("load overrides", "err", err)
			http.Error(w, `{"error":"temporarily unavailable"}`, http.StatusServiceUnavailable)
			return
		}
	}
	now := time.Now().UTC()
	results := make([]agency.StatusResult, 0, len(req.SubmissionIDs))
	for _, id := range req.SubmissionIDs {
		res := m.Status(id, now)
		if ov, ok := overrides[id]; ok && res.Status != "not_found" {
			res = agency.StatusResult{SubmissionID: id, Status: ov.Status, PaymentDate: ov.PaymentDate, UpdatedAt: ov.UpdatedAt, Manual: true}
		}
		results = append(results, res)
	}
	span.SetAttributes(attribute.Int("agency.overrides", len(overrides)))
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

type overrideRequest struct {
	Status      string `json:"status"`
	PaymentDate string `json:"paymentDate,omitempty"`
}

func (m *Mock) setOverride(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req overrideRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil || !settable[req.Status] {
		http.Error(w, `{"error":"invalid status"}`, http.StatusBadRequest)
		return
	}
	if m.Status(id, time.Now()).Status == "not_found" {
		http.Error(w, `{"error":"unknown submission"}`, http.StatusNotFound)
		return
	}
	switch req.Status {
	case "approved", "sent":
		if req.PaymentDate == "" {
			req.PaymentDate = time.Now().UTC().Format(time.DateOnly)
		} else if _, err := time.Parse(time.DateOnly, req.PaymentDate); err != nil {
			http.Error(w, `{"error":"paymentDate must be YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
	default:
		req.PaymentDate = ""
	}
	ov, err := m.overrides.Set(r.Context(), m.cfg.Agency, Override{SubmissionID: id, Status: req.Status, PaymentDate: req.PaymentDate})
	if err != nil {
		slog.Error("set override", "err", err)
		http.Error(w, `{"error":"could not save"}`, http.StatusInternalServerError)
		return
	}
	trace.SpanFromContext(r.Context()).SetAttributes(attribute.String("agency.submission_id", id), attribute.String("agency.override_status", req.Status))
	writeJSON(w, http.StatusOK, agency.StatusResult{SubmissionID: id, Status: ov.Status, PaymentDate: ov.PaymentDate, UpdatedAt: ov.UpdatedAt, Manual: true})
}

func (m *Mock) clearOverride(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := m.overrides.Clear(r.Context(), id); err != nil {
		slog.Error("clear override", "err", err)
		http.Error(w, `{"error":"could not save"}`, http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, m.Status(id, time.Now().UTC()))
}

// Status computes a submission's status at time now from the facts encoded in its ID.
func (m *Mock) Status(id string, now time.Time) agency.StatusResult {
	res := agency.StatusResult{SubmissionID: id, Status: "not_found"}
	parts := strings.Split(id, "-")
	if len(parts) < 4 || strings.Join(parts[:len(parts)-3], "-") != m.cfg.Agency {
		return res
	}
	ms, err := strconv.ParseInt(parts[len(parts)-3], 10, 64)
	if err != nil {
		return res
	}
	received := time.UnixMilli(ms).UTC()
	refund := parts[len(parts)-2] == "r"
	elapsed := now.Sub(received)

	switch {
	case elapsed < m.cfg.ProcessAfter:
		res.Status, res.UpdatedAt = "received", received
	case elapsed < m.cfg.ApproveAfter:
		res.Status, res.UpdatedAt = "processing", received.Add(m.cfg.ProcessAfter)
	case !refund:
		res.Status, res.UpdatedAt = "accepted", received.Add(m.cfg.ApproveAfter)
	case elapsed < m.cfg.SendAfter:
		res.Status, res.UpdatedAt = "approved", received.Add(m.cfg.ApproveAfter)
	default:
		res.Status, res.UpdatedAt = "sent", received.Add(m.cfg.SendAfter)
	}
	if refund && (res.Status == "approved" || res.Status == "sent") {
		res.PaymentDate = received.Add(m.cfg.SendAfter).Format(time.DateOnly)
	}
	return res
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}
