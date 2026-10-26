// Package processor screens newly filed returns and transmits them to the tax agencies.
//
// Screening uses pgvector: a return that is a near-duplicate of another taxpayer's (same
// figures, same bank account) is held for identity verification instead of being sent.
// Everything after transmission comes from the agencies, via the batch package.
//
// Returns are claimed with a short lease and FOR UPDATE SKIP LOCKED, so any number of
// replicas can run, and a return whose transmission fails is retried when its lease expires.
package processor

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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
	batchSize = 25
	lease     = 60 * time.Second
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
	taxYear                                  int
	refundCents, owedCents                   int64
	identityVerified                         bool
}

func (p *Processor) tick(ctx context.Context) error {
	if _, err := p.pool.Exec(ctx, "DELETE FROM sessions WHERE expires_at < now()"); err != nil {
		return err
	}
	rows, err := p.pool.Query(ctx, `UPDATE tax_returns t
		SET lease_until = now() + make_interval(secs => $1)
		WHERE t.id IN (
			SELECT id FROM tax_returns
			WHERE status = 'received' AND (lease_until IS NULL OR lease_until < now())
			ORDER BY submitted_at
			LIMIT $2
			FOR UPDATE SKIP LOCKED)
		RETURNING t.id, t.user_id, t.jurisdiction, t.form, t.features::text, t.tax_year, t.refund_cents, t.owed_cents,
		          t.identity_verified_at IS NOT NULL`,
		lease.Seconds(), batchSize)
	if err != nil {
		return err
	}
	batch, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pending, error) {
		var c pending
		return c, r.Scan(&c.id, &c.userID, &c.jurisdiction, &c.form, &c.features, &c.taxYear, &c.refundCents, &c.owedCents, &c.identityVerified)
	})
	if err != nil {
		return err
	}
	var errs []error
	for _, c := range batch {
		if err := p.handle(ctx, c); err != nil {
			errs = append(errs, fmt.Errorf("return %s: %w", c.id, err))
		}
	}
	return errors.Join(errs...)
}

func (p *Processor) handle(ctx context.Context, c pending) error {
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
			return err
		}
	}
	span.SetAttributes(attribute.Float64("screening.nearest_distance", distance), attribute.Bool("screening.flagged", dup),
		attribute.Bool("screening.identity_verified", c.identityVerified))
	if dup {
		slog.Warn("near-duplicate return held", "return", c.id, "distance", distance)
		return p.update(ctx, c.id, "action_needed", "Identity verification required", nil,
			"Your return needs identity verification before we can send it. We mailed a letter with instructions.")
	}

	j, _ := agency.Lookup(c.jurisdiction)
	client := p.clients[c.jurisdiction]
	if client == nil {
		return fmt.Errorf("no agency client for %s", c.jurisdiction)
	}
	resp, err := client.Submit(ctx, agency.SubmitRequest{
		Reference: c.id, Form: c.form, TaxYear: c.taxYear, RefundCents: c.refundCents, OwedCents: c.owedCents,
	})
	if err != nil {
		// Lease expires and the next tick tries again.
		span.RecordError(err)
		span.SetStatus(codes.Error, "transmission failed")
		return err
	}
	span.SetAttributes(attribute.String("agency.submission_id", resp.SubmissionID))
	return p.update(ctx, c.id, "processing", "", &resp.SubmissionID, fmt.Sprintf("We sent your return to the %s.", j.Name))
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

// nearestOtherTaxpayer finds the most similar return for the same jurisdiction filed by a
// different user, using the HNSW cosine index.
func (p *Processor) nearestOtherTaxpayer(ctx context.Context, c pending) (bool, float64, error) {
	var distance float64
	err := p.pool.QueryRow(ctx, `SELECT features <=> $1::vector
		FROM tax_returns
		WHERE user_id <> $2 AND jurisdiction = $3
		ORDER BY features <=> $1::vector
		LIMIT 1`, c.features, c.userID, c.jurisdiction).Scan(&distance)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, 0, nil
	}
	if err != nil {
		return false, 0, err
	}
	return distance < p.cfg.SimilarityThreshold, distance, nil
}
