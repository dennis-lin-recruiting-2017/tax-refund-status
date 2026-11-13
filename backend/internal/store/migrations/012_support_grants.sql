-- A taxpayer lets support see their returns for a short window. Support sees a taxpayer's returns only
-- while a grant is active: not revoked, and not yet expired. Rows are kept after they end, as a record
-- of who allowed what, and when.
CREATE TABLE support_grants (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  CHECK (expires_at > granted_at)
);
CREATE INDEX support_grants_active_idx ON support_grants (user_id, expires_at) WHERE revoked_at IS NULL;
