-- Admins operate the demo: they can change a return's status at the mock agency.
ALTER TABLE users
  ADD COLUMN role text NOT NULL DEFAULT 'taxpayer' CHECK (role IN ('taxpayer', 'admin'));

-- Set when an admin clears a duplicate-screening hold; the processor then transmits without re-screening.
ALTER TABLE tax_returns ADD COLUMN identity_verified_at timestamptz;

-- A return is due whenever next_check_at is set, whatever its status. Final statuses clear it, and
-- an admin "check now" sets it again so the next batch run picks up an agency-side change.
DROP INDEX tax_returns_due_idx;
CREATE INDEX tax_returns_due_idx ON tax_returns (jurisdiction, next_check_at)
  WHERE next_check_at IS NOT NULL AND agency_submission_id IS NOT NULL;
