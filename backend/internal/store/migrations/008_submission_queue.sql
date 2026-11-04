-- Submissions waiting for an agency are a queue per jurisdiction: a failed transmission waits its
-- own backoff instead of blocking the returns behind it, and every processor replica shares one
-- rate limit and one circuit breaker per agency.
ALTER TABLE tax_returns
  ADD COLUMN transmit_attempts    integer NOT NULL DEFAULT 0,
  -- When the processor may next try to transmit this return.
  ADD COLUMN next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_transmit_error  text;

-- The processor's "what's ready for this agency?" query.
CREATE INDEX tax_returns_outbox_idx ON tax_returns (jurisdiction, next_attempt_at)
  WHERE status = 'received';

-- One row per agency: a token bucket shared by all processor replicas, and a circuit breaker.
CREATE TABLE agency_queues (
  jurisdiction          text PRIMARY KEY,
  tokens                double precision NOT NULL,
  refilled_at           timestamptz NOT NULL DEFAULT now(),
  -- Transmissions that failed in a row because of the agency (5xx, 429, network), not the return.
  consecutive_failures  integer NOT NULL DEFAULT 0,
  -- While set and in the future, nothing is sent to this agency.
  open_until            timestamptz
);
