-- Status now comes from the agencies: returns are transmitted, then polled in batch runs.
ALTER TABLE tax_returns
  ADD COLUMN agency_submission_id text,
  ADD COLUMN transmitted_at       timestamptz,
  ADD COLUMN agency_updated_at    timestamptz,
  ADD COLUMN last_checked_at      timestamptz,
  -- When the next batch run should ask the agency about this return. NULL = never (final status).
  ADD COLUMN next_check_at        timestamptz,
  ADD COLUMN check_count          integer NOT NULL DEFAULT 0,
  -- Short lease while a worker transmits or checks this return, so others skip it.
  ADD COLUMN lease_until          timestamptz;

-- The batch runner's "what's due?" query.
CREATE INDEX tax_returns_due_idx ON tax_returns (jurisdiction, next_check_at)
  WHERE status IN ('processing', 'approved') AND agency_submission_id IS NOT NULL;

-- Returns that were in flight under the old simulated processor get transmitted for real.
UPDATE tax_returns SET status = 'received'
  WHERE status IN ('processing', 'approved') AND agency_submission_id IS NULL;

CREATE TABLE batch_runs (
  id               bigserial PRIMARY KEY,
  jurisdiction     text NOT NULL,
  shard_index      integer NOT NULL,
  shard_count      integer NOT NULL,
  trigger          text NOT NULL,             -- schedule, cron, manual
  status           text NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  returns_checked  integer NOT NULL DEFAULT 0,
  status_changes   integer NOT NULL DEFAULT 0,
  chunks_failed    integer NOT NULL DEFAULT 0,
  trace_id         text,                      -- open this run's trace in Jaeger
  error            text
);
CREATE INDEX batch_runs_recent_idx ON batch_runs (jurisdiction, started_at DESC);
