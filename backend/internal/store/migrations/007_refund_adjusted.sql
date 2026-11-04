-- "Refund adjusted": the agency sent a refund that differs from the one claimed.
ALTER TABLE tax_returns DROP CONSTRAINT tax_returns_status_check;
ALTER TABLE tax_returns ADD CONSTRAINT tax_returns_status_check
  CHECK (status IN ('received', 'processing', 'action_needed', 'approved', 'sent', 'adjusted', 'accepted'));
