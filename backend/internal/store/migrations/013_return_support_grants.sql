-- Support access is granted one return at a time. Account-wide grants from 012 can't be tied to a return,
-- so they're dropped; they only ever lasted five minutes.
DELETE FROM support_grants;
ALTER TABLE support_grants ADD COLUMN return_id uuid NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE;
DROP INDEX support_grants_active_idx;
CREATE INDEX support_grants_active_idx ON support_grants (return_id, expires_at) WHERE revoked_at IS NULL;
-- The access log on the support page reads a taxpayer's recent grants, newest first.
CREATE INDEX support_grants_user_idx ON support_grants (user_id, granted_at DESC);
