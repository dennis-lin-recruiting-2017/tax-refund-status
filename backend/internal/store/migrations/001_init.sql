CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  text NOT NULL,
  full_name      text NOT NULL,
  -- Only the last four digits of the tax ID are stored; the demo never handles full IDs.
  tax_id_last4   char(4) NOT NULL,
  failed_logins  integer NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Opaque session tokens; only a SHA-256 of the token is stored.
CREATE TABLE sessions (
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE tax_returns (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jurisdiction           text NOT NULL CHECK (jurisdiction IN ('federal', 'CA')),
  form                   text NOT NULL CHECK (form IN ('1040', '540')),
  tax_year               integer NOT NULL,
  filing_status          text NOT NULL,
  input                  jsonb NOT NULL,
  computed               jsonb NOT NULL,
  refund_cents           bigint NOT NULL DEFAULT 0,
  owed_cents             bigint NOT NULL DEFAULT 0,
  bank_last4             char(4),
  -- Keyed HMAC of routing+account so duplicates can be matched without storing the number.
  bank_fingerprint       bytea,
  status                 text NOT NULL DEFAULT 'received'
                         CHECK (status IN ('received', 'processing', 'action_needed', 'approved', 'sent', 'accepted')),
  status_reason          text,
  expected_payment_date  date,
  -- Feature embedding used for near-duplicate (possible identity theft) detection.
  features               vector(16) NOT NULL,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  status_changed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, jurisdiction, tax_year)
);
CREATE INDEX tax_returns_status_idx ON tax_returns (status, status_changed_at);
CREATE INDEX tax_returns_features_idx ON tax_returns USING hnsw (features vector_cosine_ops);

CREATE TABLE return_events (
  id          bigserial PRIMARY KEY,
  return_id   uuid NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
  status      text NOT NULL,
  note        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX return_events_return_idx ON return_events (return_id, created_at);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
