// Package processor screens newly filed returns and transmits them to the tax agencies.
//
// Screening uses pgvector: a return that is a near-duplicate of another taxpayer's (same
// figures, same bank account) is held for identity verification instead of being sent.
// Everything after transmission comes from the agencies, via the batch package.
//
// Returns waiting to be sent form one queue per agency, kept in tax_returns itself so a filed
// return and its place in the queue are written in one transaction. Each tick, for each agency:
//
//   - the agency's circuit breaker is checked: after repeated agency-side failures nothing is sent
//     until a cooldown passes, then a single probe decides whether to resume;
//   - tokens are taken from the agency's bucket in agency_queues, a rate limit shared by every
//     replica, so adding processors never adds load on the agency;
//   - that many ready returns are claimed with a short lease and FOR UPDATE SKIP LOCKED;
//   - a return that fails waits its own exponential backoff with jitter, so it neither blocks the
//     returns behind it nor retries in step with every other failure.
//
// One agency being down or slow never holds up another's queue.
package processor

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"taxrefund/internal/agency"
	"taxrefund/internal/config"
)

const (
	batchSize = 25 // most returns one replica claims per agency per tick
	lease     = 60 * time.Second

	retryBase = 2 * time.Second  // first retry waits up to this long
	retryCap  = 10 * time.Minute // longest wait between attempts

	breakerThreshold = 5                // agency-side failures in a row that open the breaker
	breakerCooldown  = 30 * time.Second // how long it stays open before a probe
)

type Processor struct {
	pool    *pgxpool.Pool
	cfg     config.Config
	clients map[string]*agency.Client
	tracer  trace.Tracer
}

func New(pool *pgxpool.Pool, cfg config.Config, clients map[string]*agency.Client, tp trace.TracerProvider) *Processor {
	return &Processor{pool: pool, cfg: cfg, clients: clients, tracer: tp.Tracer("taxrefund/processor")}
}

func (p *Processor) Run(ctx context.Context) error {
	slog.Info("processor started", "interval", p.cfg.ProcessorInterval)
	t := time.NewTicker(p.cfg.ProcessorInterval)
	defer t.Stop()
	for {
		if err := p.tick(ctx); err != nil && ctx.Err() == nil {
			slog.Error("processor tick failed", "err", err)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
		}
	}
}

type pending struct {
	id, userID, jurisdiction, form, features string
	bankFingerprint                          []byte
	taxYear                                  int
	refundCents, owedCents                   int64
	identityVerified                         bool
	attempts                                 int
}

func (p *Processor) tick(ctx context.Context) error {
	if _, err := p.pool.Exec(ctx, "DELETE FROM sessions WHERE expires_at < now()"); err != nil {
		return err
	}
	codes := make([]string, 0, len(p.clients))
	for code := range p.clients {
		codes = append(codes, code)
	}
	slices.Sort(codes)
	var errs []error
	for _, code := range codes {
		if err := p.drain(ctx, code); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", code, err))
		}
	}
	return errors.Join(errs...)
}

// drain sends as many of one agency's ready returns as its breaker and rate limit allow.
func (p *Processor) drain(ctx context.Context, jurisdiction string) error {
	granted, err := p.takeTokens(ctx, jurisdiction, batchSize)
	if err != nil || granted == 0 {
		return err
	}
	batch, err := p.claim(ctx, jurisdiction, granted)
	if err != nil {
		p.returnTokens(ctx, jurisdiction, granted)
		return err
	}
	var errs []error
	sent := 0
	for i, c := range batch {
		transmitted, err := p.handle(ctx, c)
		if transmitted {
			sent++
		}
		if err != nil {
			errs = append(errs, fmt.Errorf("return %s: %w", c.id, err))
		}
		// The agency itself is failing: stop calling it and let the rest of the batch go back.
		var te *transmitError
		if errors.As(err, &te) && agencyFault(te.err) {
			p.release(ctx, batch[i+1:])
			break
		}
	}
	// Tokens for returns that weren't there, or were held by screening, go back in the bucket.
	p.returnTokens(ctx, jurisdiction, granted-sent)
	return errors.Join(errs...)
}

// takeTokens refills the agency's bucket for the time since it was last used and takes up to
// want tokens from it. While the breaker is open it grants none; once the cooldown has passed it
// grants one, so a single probe decides whether the agency is back. The row lock makes this
// atomic across replicas.
func (p *Processor) takeTokens(ctx context.Context, jurisdiction string, want int) (int, error) {
	rps := p.cfg.SubmitRPS
	burst := max(1, rps)
	if _, err := p.pool.Exec(ctx, `INSERT INTO agency_queues (jurisdiction, tokens) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, jurisdiction, burst); err != nil {
		return 0, err
	}
	var granted int
	err := p.pool.QueryRow(ctx, `WITH s AS (
			SELECT jurisdiction,
			       LEAST($2::float8, tokens + EXTRACT(EPOCH FROM now() - refilled_at) * $3::float8) AS available,
			       CASE WHEN open_until > now() THEN 0
			            WHEN consecutive_failures >= $5 THEN 1
			            ELSE $4::int END AS allowed
			FROM agency_queues WHERE jurisdiction = $1 FOR UPDATE)
		UPDATE agency_queues q
		SET tokens = s.available - LEAST(s.allowed, floor(s.available)::int), refilled_at = now(),
		    -- Granting the probe re-arms the breaker, so other replicas wait for its result.
		    open_until = CASE WHEN q.consecutive_failures >= $5 AND LEAST(s.allowed, floor(s.available)::int) > 0
		                      THEN now() + make_interval(secs => $6) ELSE q.open_until END
		FROM s WHERE q.jurisdiction = s.jurisdiction
		RETURNING LEAST(s.allowed, floor(s.available)::int)`,
		jurisdiction, burst, rps, want, breakerThreshold, breakerCooldown.Seconds()).Scan(&granted)
	return granted, err
}

func (p *Processor) returnTokens(ctx context.Context, jurisdiction string, n int) {
	if n <= 0 {
		return
	}
	if _, err := p.pool.Exec(ctx, `UPDATE agency_queues SET tokens = LEAST($2::float8, tokens + $3)
		WHERE jurisdiction = $1`, jurisdiction, max(1, p.cfg.SubmitRPS), n); err != nil {
		slog.Error("returning agency tokens failed", "jurisdiction", jurisdiction, "err", err)
	}
}

// release gives up the lease on returns that were claimed but not attempted.
func (p *Processor) release(ctx context.Context, batch []pending) {
	if len(batch) == 0 {
		return
	}
	ids := make([]string, len(batch))
	for i, c := range batch {
		ids[i] = c.id
	}
	if _, err := p.pool.Exec(ctx, "UPDATE tax_returns SET lease_until = NULL WHERE id = ANY($1::uuid[])", ids); err != nil {
		slog.Error("releasing returns failed", "err", err)
	}
}

// claim leases up to n of the agency's returns that are ready to send, oldest first.
func (p *Processor) claim(ctx context.Context, jurisdiction string, n int) ([]pending, error) {
	rows, err := p.pool.Query(ctx, `UPDATE tax_returns t
		SET lease_until = now() + make_interval(secs => $1)
		WHERE t.id IN (
			SELECT id FROM tax_returns
			WHERE status = 'received' AND jurisdiction = $3 AND next_attempt_at <= now()
			  AND (lease_until IS NULL OR lease_until < now())
			ORDER BY next_attempt_at, submitted_at
			LIMIT $2
			FOR UPDATE SKIP LOCKED)
		RETURNING t.id, t.user_id, t.jurisdiction, t.form, t.features::text, t.bank_fingerprint, t.tax_year, t.refund_cents, t.owed_cents,
		          t.identity_verified_at IS NOT NULL, t.transmit_attempts`,
		lease.Seconds(), n, jurisdiction)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (pending, error) {
		var c pending
		return c, r.Scan(&c.id, &c.userID, &c.jurisdiction, &c.form, &c.features, &c.bankFingerprint, &c.taxYear, &c.refundCents, &c.owedCents,
			&c.identityVerified, &c.attempts)
	})
}

// handle screens one return and transmits it. It reports whether it called the agency, which is
// what used a token.
func (p *Processor) handle(ctx context.Context, c pending) (bool, error) {
	ctx, span := p.tracer.Start(ctx, "processor.transmit", trace.WithNewRoot(), trace.WithAttributes(
		attribute.String("return.id", c.id),
		attribute.String("return.jurisdiction", c.jurisdiction),
		attribute.String("return.form", c.form),
	))
	defer span.End()

	// An admin who verified the taxpayer's identity has cleared the hold; don't re-screen.
	dup, distance := false, 0.0
	if !c.identityVerified {
		var err error
		if dup, distance, err = p.nearestOtherTaxpayer(ctx, c); err != nil {
			span.RecordError(err)
			return false, err
		}
	}
	span.SetAttributes(attribute.Float64("screening.nearest_distance", distance), attribute.Bool("screening.flagged", dup),
		attribute.Bool("screening.identity_verified", c.identityVerified))
	if dup {
		slog.Warn("near-duplicate return held", "return", c.id, "distance", distance)
		return false, p.update(ctx, c.id, "action_needed", "Identity verification required", nil,
			"Your return needs identity verification before we can send it. We mailed a letter with instructions.")
	}

	j, _ := agency.Lookup(c.jurisdiction)
	client := p.clients[c.jurisdiction]
	if client == nil {
		return false, fmt.Errorf("no agency client for %s", c.jurisdiction)
	}
	resp, err := client.Submit(ctx, agency.SubmitRequest{
		Reference: c.id, Form: c.form, TaxYear: c.taxYear, RefundCents: c.refundCents, OwedCents: c.owedCents,
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "transmission failed")
		wait := retryDelay(c.attempts+1, rand.Float64())
		span.SetAttributes(attribute.Int("transmit.attempt", c.attempts+1), attribute.String("transmit.retry_in", wait.String()))
		if ferr := p.failed(ctx, c, err, wait); ferr != nil {
			return true, errors.Join(&transmitError{err}, ferr)
		}
		return true, &transmitError{err}
	}
	span.SetAttributes(attribute.String("agency.submission_id", resp.SubmissionID))
	if _, err := p.pool.Exec(ctx, `UPDATE agency_queues SET consecutive_failures = 0, open_until = NULL
		WHERE jurisdiction = $1 AND consecutive_failures > 0`, c.jurisdiction); err != nil {
		slog.Error("closing agency breaker failed", "jurisdiction", c.jurisdiction, "err", err)
	}
	return true, p.update(ctx, c.id, "processing", "", &resp.SubmissionID, fmt.Sprintf("We sent your return to the %s.", j.Name))
}

// failed schedules the return's next attempt and, when the agency rather than the return was at
// fault, counts toward opening the agency's breaker.
func (p *Processor) failed(ctx context.Context, c pending, cause error, wait time.Duration) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE tax_returns
			SET transmit_attempts = transmit_attempts + 1, last_transmit_error = $2,
			    next_attempt_at = now() + make_interval(secs => $3), lease_until = NULL
			WHERE id = $1`, c.id, cause.Error(), wait.Seconds()); err != nil {
			return err
		}
		if !agencyFault(cause) {
			return nil
		}
		var opened bool
		if err := tx.QueryRow(ctx, `UPDATE agency_queues
			SET consecutive_failures = consecutive_failures + 1,
			    open_until = CASE WHEN consecutive_failures + 1 >= $2 THEN now() + make_interval(secs => $3) ELSE open_until END
			WHERE jurisdiction = $1
			RETURNING consecutive_failures >= $2`, c.jurisdiction, breakerThreshold, breakerCooldown.Seconds()).Scan(&opened); err != nil {
			return err
		}
		if opened {
			slog.Warn("agency breaker open", "jurisdiction", c.jurisdiction, "cooldown", breakerCooldown, "err", cause)
		}
		return nil
	})
}

// transmitError is a failure from the agency call itself, as opposed to screening or the database.
type transmitError struct{ err error }

func (e *transmitError) Error() string { return e.err.Error() }
func (e *transmitError) Unwrap() error { return e.err }

// retryDelay is how long to wait before the given attempt: exponential with full jitter, so
// returns that failed together don't all retry together. r is a random number in [0, 1).
func retryDelay(attempt int, r float64) time.Duration {
	ceiling := retryCap
	if attempt < 20 {
		ceiling = min(retryCap, retryBase<<(attempt-1))
	}
	return time.Second + time.Duration(r*float64(ceiling))
}

// agencyFault reports whether a failed transmission says something about the agency (down,
// overloaded, or refusing our credentials) rather than about this one return.
func agencyFault(err error) bool {
	var se *agency.StatusError
	if !errors.As(err, &se) {
		return true // 5xx, 429, timeouts, and network errors after the client's own retries
	}
	return se.Code == http.StatusUnauthorized || se.Code == http.StatusForbidden
}

func (p *Processor) update(ctx context.Context, id, status, reason string, submissionID *string, note string) error {
	var reasonArg *string
	if reason != "" {
		reasonArg = &reason
	}
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		// A transmitted return is due for its first status check on the next batch run.
		_, err := tx.Exec(ctx, `UPDATE tax_returns
			SET status = $2, status_reason = $3, status_changed_at = now(), lease_until = NULL,
			    agency_submission_id = $4,
			    transmitted_at = CASE WHEN $4::text IS NOT NULL THEN now() END,
			    next_check_at  = CASE WHEN $4::text IS NOT NULL THEN now() END
			WHERE id = $1`, id, status, reasonArg, submissionID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "INSERT INTO return_events (return_id, status, note) VALUES ($1, $2, $3)", id, status, note)
		return err
	})
}

// nearestOtherTaxpayer finds, among other taxpayers' returns for the same jurisdiction that pay
// into the same bank account, the one with the most similar figures. Different taxpayers sharing
// an account is the fraud signal; near-identical figures confirm a templated return. Honest filers
// with similar incomes but their own accounts are never compared.
func (p *Processor) nearestOtherTaxpayer(ctx context.Context, c pending) (bool, float64, error) {
	var distance float64
	err := p.pool.QueryRow(ctx, `SELECT features <=> $1::vector
		FROM tax_returns
		WHERE user_id <> $2 AND jurisdiction = $3 AND bank_fingerprint = $4
		ORDER BY features <=> $1::vector
		LIMIT 1`, c.features, c.userID, c.jurisdiction, c.bankFingerprint).Scan(&distance)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, 0, nil
	}
	if err != nil {
		return false, 0, err
	}
	return distance < p.cfg.SimilarityThreshold, distance, nil
}
