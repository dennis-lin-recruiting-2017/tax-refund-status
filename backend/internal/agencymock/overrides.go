package agencymock

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Override pins a submission to a status chosen by a demo operator, in place of the automatic
// timeline. It stands in for an agency changing its own records.
type Override struct {
	SubmissionID string
	Status       string
	PaymentDate  string // YYYY-MM-DD, approved/sent only
	UpdatedAt    time.Time
}

// Overrides persists overrides in the agency_mock schema: the mock agency's own data, kept
// apart from the refund service's tables.
type Overrides struct{ pool *pgxpool.Pool }

func NewOverrides(ctx context.Context, pool *pgxpool.Pool) (*Overrides, error) {
	// Every mock replica runs this at startup; the advisory lock stops concurrent CREATEs from colliding.
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(727275)"); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			CREATE SCHEMA IF NOT EXISTS agency_mock;
			CREATE TABLE IF NOT EXISTS agency_mock.status_overrides (
				submission_id text PRIMARY KEY,
				agency        text NOT NULL,
				status        text NOT NULL,
				payment_date  date,
				updated_at    timestamptz NOT NULL DEFAULT now()
			)`)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &Overrides{pool: pool}, nil
}

func (o *Overrides) Get(ctx context.Context, ids []string) (map[string]Override, error) {
	rows, err := o.pool.Query(ctx, `SELECT submission_id, status, COALESCE(to_char(payment_date, 'YYYY-MM-DD'), ''), updated_at
		FROM agency_mock.status_overrides WHERE submission_id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Override, error) {
		var ov Override
		return ov, r.Scan(&ov.SubmissionID, &ov.Status, &ov.PaymentDate, &ov.UpdatedAt)
	})
	out := make(map[string]Override, len(list))
	for _, ov := range list {
		out[ov.SubmissionID] = ov
	}
	return out, err
}

func (o *Overrides) Set(ctx context.Context, agency string, ov Override) (Override, error) {
	var pd *string
	if ov.PaymentDate != "" {
		pd = &ov.PaymentDate
	}
	err := o.pool.QueryRow(ctx, `INSERT INTO agency_mock.status_overrides (submission_id, agency, status, payment_date)
		VALUES ($1, $2, $3, $4::date)
		ON CONFLICT (submission_id) DO UPDATE SET status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = now()
		RETURNING updated_at`, ov.SubmissionID, agency, ov.Status, pd).Scan(&ov.UpdatedAt)
	return ov, err
}

func (o *Overrides) Clear(ctx context.Context, id string) error {
	_, err := o.pool.Exec(ctx, `DELETE FROM agency_mock.status_overrides WHERE submission_id = $1`, id)
	return err
}
