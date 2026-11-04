// Package batch syncs refund statuses from the tax agencies in scheduled batch runs.
//
// Agencies update refund status on their own cycle (the IRS roughly once a day), so asking
// them on every page view would multiply load without making answers fresher. Instead, runs
// throughout the day ask each agency about the returns that are due, using its bulk status
// endpoint, and store the answers. Taxpayers always read the stored status.
//
// A run is one (jurisdiction, shard) pair. Work is claimed in chunks with a short lease and
// FOR UPDATE SKIP LOCKED, so shards and workers never check the same return twice, and a
// chunk that fails is simply picked up again by the next run.
package batch

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/sync/errgroup"

	"taxrefund/internal/agency"
	"taxrefund/internal/config"
)

// maxFailedChunks stops a run early when the agency is clearly unhealthy, rather than
// hammering it. Unchecked returns stay due and the next run tries again.
const maxFailedChunks = 5

type Runner struct {
	pool    *pgxpool.Pool
	cfg     config.Config
	clients map[string]*agency.Client // by jurisdiction code
	tracer  trace.Tracer
}

func NewRunner(pool *pgxpool.Pool, cfg config.Config, clients map[string]*agency.Client, tp trace.TracerProvider) *Runner {
	return &Runner{pool: pool, cfg: cfg, clients: clients, tracer: tp.Tracer("taxrefund/batch")}
}

type Summary struct {
	RunID        int64
	Jurisdiction string
	Checked      int
	Changed      int
	ChunksFailed int
	Status       string
}

type due struct {
	id, submissionID, status string
	checkCount               int
	// What we last stored from the agency, to tell whether its details changed.
	refundCents, owedCents *int64
	message                *string
}

// dueColumns must match scanDue.
const dueColumns = `t.id, t.agency_submission_id, t.status, t.check_count,
	t.agency_refund_cents, t.agency_owed_cents, t.agency_message`

func scanDue(row pgx.CollectableRow) (due, error) {
	var d due
	return d, row.Scan(&d.id, &d.submissionID, &d.status, &d.checkCount, &d.refundCents, &d.owedCents, &d.message)
}

// Run performs one batch run for a jurisdiction's shard, until nothing more is due.
func (r *Runner) Run(ctx context.Context, jurisdiction, trigger string) (Summary, error) {
	j, ok := agency.Lookup(jurisdiction)
	client := r.clients[jurisdiction]
	if !ok || client == nil {
		return Summary{}, fmt.Errorf("no agency client for jurisdiction %q", jurisdiction)
	}
	shard, shards := r.cfg.BatchShardIndex, r.cfg.BatchShards

	ctx, span := r.tracer.Start(ctx, "batch.run "+j.Agency, trace.WithNewRoot(), trace.WithAttributes(
		attribute.String("batch.jurisdiction", jurisdiction),
		attribute.String("batch.agency", j.Agency),
		attribute.Int("batch.shard_index", shard),
		attribute.Int("batch.shard_count", shards),
		attribute.String("batch.trigger", trigger),
	))
	defer span.End()

	var traceID *string
	if sc := span.SpanContext(); sc.IsValid() {
		s := sc.TraceID().String()
		traceID = &s
	}
	sum := Summary{Jurisdiction: jurisdiction}
	if err := r.pool.QueryRow(ctx, `INSERT INTO batch_runs (jurisdiction, shard_index, shard_count, trigger, trace_id)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`, jurisdiction, shard, shards, trigger, traceID).Scan(&sum.RunID); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "create run")
		return sum, err
	}
	span.SetAttributes(attribute.Int64("batch.run_id", sum.RunID))

	// Only returns due when the run started; anything rescheduled during the run waits for the next.
	cutoff := time.Now()
	var mu sync.Mutex
	g, gctx := errgroup.WithContext(ctx)
	for range r.cfg.BatchWorkers {
		g.Go(func() error {
			for {
				chunk, err := r.claim(gctx, jurisdiction, cutoff, shard, shards)
				if err != nil {
					return err
				}
				if len(chunk) == 0 {
					return nil
				}
				changed, err := r.checkChunk(gctx, client, j, chunk)
				mu.Lock()
				if err != nil {
					sum.ChunksFailed++
				} else {
					sum.Checked += len(chunk)
					sum.Changed += changed
				}
				tripped := sum.ChunksFailed >= maxFailedChunks
				mu.Unlock()
				if err != nil && gctx.Err() != nil {
					return gctx.Err()
				}
				if tripped {
					span.AddEvent("circuit open: too many failed chunks")
					return nil
				}
			}
		})
	}
	runErr := g.Wait()

	switch {
	case runErr != nil:
		sum.Status = "failed"
	case sum.ChunksFailed > 0:
		sum.Status = "partial"
	default:
		sum.Status = "succeeded"
	}
	var errText *string
	if runErr != nil {
		s := runErr.Error()
		errText = &s
		span.RecordError(runErr)
		span.SetStatus(codes.Error, "run failed")
	}
	span.SetAttributes(
		attribute.Int("batch.returns_checked", sum.Checked),
		attribute.Int("batch.status_changes", sum.Changed),
		attribute.Int("batch.chunks_failed", sum.ChunksFailed),
		attribute.String("batch.status", sum.Status),
	)
	// Record the outcome even if the run's context was cancelled.
	if _, err := r.pool.Exec(context.WithoutCancel(ctx), `UPDATE batch_runs
		SET status = $2, finished_at = now(), returns_checked = $3, status_changes = $4, chunks_failed = $5, error = $6
		WHERE id = $1`, sum.RunID, sum.Status, sum.Checked, sum.Changed, sum.ChunksFailed, errText); err != nil {
		return sum, errors.Join(runErr, err)
	}
	return sum, runErr
}

// claim leases the next chunk of due returns for this shard.
func (r *Runner) claim(ctx context.Context, jurisdiction string, cutoff time.Time, shard, shards int) ([]due, error) {
	rows, err := r.pool.Query(ctx, `UPDATE tax_returns t
		SET lease_until = now() + make_interval(secs => $5)
		WHERE t.id IN (
			SELECT id FROM tax_returns
			WHERE jurisdiction = $1
			  AND agency_submission_id IS NOT NULL
			  AND next_check_at IS NOT NULL
			  AND next_check_at <= $2
			  AND (lease_until IS NULL OR lease_until < now())
			  AND mod(abs(hashtext(id::text)), $3) = $4
			ORDER BY next_check_at
			LIMIT $6
			FOR UPDATE SKIP LOCKED)
		RETURNING `+dueColumns,
		jurisdiction, cutoff, shards, shard, r.cfg.BatchLease.Seconds(), r.cfg.BatchChunkSize)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanDue)
}

// ErrBusy means another worker is checking the return right now.
var ErrBusy = errors.New("return is being checked by another worker")

// CheckOne syncs a single return with its agency immediately, through the same path as batch
// runs. The admin console uses it so a status change reaches the taxpayer without waiting for
// the next run; a real product would use it for "check again now" from a support agent.
func (r *Runner) CheckOne(ctx context.Context, returnID string) error {
	ctx, span := r.tracer.Start(ctx, "batch.check_one", trace.WithAttributes(attribute.String("return.id", returnID)))
	defer span.End()

	var jurisdiction string
	rows, err := r.pool.Query(ctx, `UPDATE tax_returns t
		SET lease_until = now() + make_interval(secs => $2)
		WHERE t.id = $1 AND t.agency_submission_id IS NOT NULL AND (t.lease_until IS NULL OR t.lease_until < now())
		RETURNING t.jurisdiction, `+dueColumns, returnID, r.cfg.BatchLease.Seconds())
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (due, error) {
		var d due
		return d, row.Scan(&jurisdiction, &d.id, &d.submissionID, &d.status, &d.checkCount, &d.refundCents, &d.owedCents, &d.message)
	})
	if err != nil {
		return err
	}
	if len(list) == 0 {
		return ErrBusy
	}
	j, _ := agency.Lookup(jurisdiction)
	client := r.clients[jurisdiction]
	if client == nil {
		return fmt.Errorf("no agency client for jurisdiction %q", jurisdiction)
	}
	_, err = r.checkChunk(ctx, client, j, list)
	return err
}

// checkChunk asks the agency about one chunk and stores the answers in one transaction.
// On error the lease is left to expire, so the chunk is retried by a later run.
func (r *Runner) checkChunk(ctx context.Context, client *agency.Client, j agency.Jurisdiction, chunk []due) (int, error) {
	ctx, span := r.tracer.Start(ctx, "batch.chunk", trace.WithAttributes(attribute.Int("batch.chunk_size", len(chunk))))
	defer span.End()

	ids := make([]string, len(chunk))
	byID := make(map[string]due, len(chunk))
	for i, d := range chunk {
		ids[i] = d.submissionID
		byID[d.submissionID] = d
	}
	results, err := client.BatchStatus(ctx, ids)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "agency status request failed")
		slog.Warn("batch chunk failed", "agency", j.Agency, "size", len(chunk), "err", err)
		return 0, err
	}

	now := time.Now()
	changed := 0
	b := &pgx.Batch{}
	for _, res := range results {
		d, ok := byID[res.SubmissionID]
		if !ok {
			continue
		}
		delete(byID, res.SubmissionID)
		next := MapStatus(res.Status)
		if next == "" { // not_found or unknown: keep status, try again later
			slog.Warn("agency did not recognise submission", "agency", j.Agency, "return", d.id, "agency_status", res.Status)
			next = d.status
		}
		nextCheck := NextCheck(next, res.PaymentDate, now, r.cfg.RecheckInterval)
		var paymentDate *string
		if res.PaymentDate != "" {
			paymentDate = &res.PaymentDate
		}
		refund, owed, msg := cents(res.RefundAmount), cents(res.AmountOwed), nonEmpty(res.Message)
		b.Queue(`UPDATE tax_returns
			SET last_checked_at = now(), check_count = check_count + 1, next_check_at = $2, lease_until = NULL,
			    agency_updated_at = $3, expected_payment_date = COALESCE($4::date, expected_payment_date),
			    agency_refund_cents = $5, agency_owed_cents = $6, agency_message = $7
			WHERE id = $1`, d.id, nextCheck, nullTime(res.UpdatedAt), paymentDate, refund, owed, msg)
		detailsChanged := !sameInt(d.refundCents, refund) || !sameInt(d.owedCents, owed) || !sameStr(d.message, msg)
		note := Note(next, j.Name, res.RefundAmount, res.AmountOwed, res.Message)
		switch {
		case next != d.status:
			changed++
			var reason *string
			if next == "action_needed" {
				r := j.Name + " requested more information"
				reason = &r
			}
			b.Queue(`UPDATE tax_returns SET status = $2, status_reason = $3, status_changed_at = now() WHERE id = $1`, d.id, next, reason)
			b.Queue(`INSERT INTO return_events (return_id, status, note) VALUES ($1, $2, $3)`, d.id, next, note)
		case detailsChanged && (refund != nil || owed != nil || msg != nil):
			// Same status, new amount or message: the taxpayer still needs to hear about it.
			changed++
			b.Queue(`INSERT INTO return_events (return_id, status, note) VALUES ($1, $2, $3)`, d.id, next, "Update: "+note)
		}
	}
	// Anything the agency left out of its response is retried on the next run.
	for _, d := range byID {
		b.Queue(`UPDATE tax_returns SET lease_until = NULL WHERE id = $1`, d.id)
	}
	if err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error { return tx.SendBatch(ctx, b).Close() }); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "store results")
		return 0, err
	}
	span.SetAttributes(attribute.Int("batch.status_changes", changed))
	return changed, nil
}

// MapStatus converts an agency status to ours. Agency "received" means it has our return,
// which taxpayers see as Processing; "action_required" means the agency needs something from
// the taxpayer.
func MapStatus(agencyStatus string) string {
	switch agencyStatus {
	case "received", "processing":
		return "processing"
	case "approved", "sent", "adjusted", "accepted":
		return agencyStatus
	case "action_required":
		return "action_needed"
	}
	return ""
}

// NextCheck decides when a transmitted return is due again. Final statuses are never checked
// again. Approved refunds wait for their payment date, the next point at which anything
// changes. Returns the agency has put on hold keep being checked, since the agency resolves them.
func NextCheck(status, paymentDate string, now time.Time, recheck time.Duration) *time.Time {
	var next time.Time
	switch status {
	case "sent", "adjusted", "accepted":
		return nil
	case "approved":
		next = now.Add(recheck)
		if pd, err := time.Parse(time.DateOnly, paymentDate); err == nil && pd.After(next) {
			next = pd
		}
	default:
		next = now.Add(recheck)
	}
	// Up to 10% jitter spreads load instead of every return coming due at the same instant.
	next = next.Add(time.Duration(rand.Int64N(int64(recheck)/10 + 1)))
	return &next
}

// Note is the status history entry shown to the taxpayer, including any amount the agency
// reported and its message.
func Note(status, agencyName string, refund, owed *int64, message string) string {
	var s string
	switch status {
	case "processing":
		s = fmt.Sprintf("The %s is processing your return.", agencyName)
	case "approved":
		s = fmt.Sprintf("The %s approved your refund.", agencyName)
		if refund != nil {
			s = fmt.Sprintf("The %s approved your refund of %s.", agencyName, USD(*refund))
		}
	case "sent":
		s = fmt.Sprintf("The %s sent your refund by direct deposit.", agencyName)
		if refund != nil {
			s = fmt.Sprintf("The %s sent your refund of %s by direct deposit.", agencyName, USD(*refund))
		}
	case "adjusted":
		s = fmt.Sprintf("The %s adjusted your refund and sent it by direct deposit.", agencyName)
		if refund != nil {
			s = fmt.Sprintf("The %s adjusted your refund to %s and sent it by direct deposit.", agencyName, USD(*refund))
		}
	case "accepted":
		s = fmt.Sprintf("The %s accepted your return.", agencyName)
		if owed != nil && *owed > 0 {
			s += " Balance due: " + USD(*owed) + "."
		}
	case "action_needed":
		if message != "" {
			return fmt.Sprintf("The %s needs more information: %s", agencyName, message)
		}
		return fmt.Sprintf("The %s needs more information to process your return. Watch your mail for a letter with instructions.", agencyName)
	default:
		s = "Your return's status changed."
	}
	if message != "" {
		s += " " + message
	}
	return s
}

// USD formats whole dollars as "$1,234".
func USD(dollars int64) string {
	sign := ""
	if dollars < 0 {
		sign, dollars = "-", -dollars
	}
	digits := fmt.Sprint(dollars)
	for i := len(digits) - 3; i > 0; i -= 3 {
		digits = digits[:i] + "," + digits[i:]
	}
	return sign + "$" + digits
}

func cents(dollars *int64) *int64 {
	if dollars == nil {
		return nil
	}
	c := *dollars * 100
	return &c
}

func nonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func sameInt(a, b *int64) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }

func sameStr(a, b *string) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }

func nullTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

// Schedule runs every jurisdiction's batch on a fixed interval until ctx is cancelled. It is
// for dev and Docker Compose; Kubernetes uses a CronJob that calls Run once per schedule.
func (r *Runner) Schedule(ctx context.Context) error {
	slog.Info("batch scheduler started", "interval", r.cfg.BatchInterval, "shard", r.cfg.BatchShardIndex, "shards", r.cfg.BatchShards)
	t := time.NewTicker(r.cfg.BatchInterval)
	defer t.Stop()
	for {
		r.RunAll(ctx, "schedule")
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
		}
	}
}

// RunAll runs every jurisdiction concurrently and logs each summary.
func (r *Runner) RunAll(ctx context.Context, trigger string) error {
	var wg sync.WaitGroup
	errs := make([]error, len(agency.Jurisdictions))
	for i, j := range agency.Jurisdictions {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sum, err := r.Run(ctx, j.Code, trigger)
			errs[i] = err
			level := slog.LevelInfo
			if err != nil || sum.ChunksFailed > 0 {
				level = slog.LevelWarn
			}
			if sum.Checked > 0 || sum.ChunksFailed > 0 || err != nil {
				slog.Log(ctx, level, "batch run finished", "run", sum.RunID, "jurisdiction", j.Code, "status", sum.Status,
					"checked", sum.Checked, "changed", sum.Changed, "chunks_failed", sum.ChunksFailed, "err", err)
			}
		}()
	}
	wg.Wait()
	return errors.Join(errs...)
}
