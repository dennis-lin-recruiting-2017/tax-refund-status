-- Either side can end a support grant early: the taxpayer who gave it, or the support agent who no longer
-- needs it. The access log says which. Grants ended before this column existed were all ended by taxpayers.
ALTER TABLE support_grants ADD COLUMN revoked_by text CHECK (revoked_by IN ('taxpayer', 'support'));
UPDATE support_grants SET revoked_by = 'taxpayer' WHERE revoked_at IS NOT NULL;
ALTER TABLE support_grants ADD CHECK ((revoked_at IS NULL) = (revoked_by IS NULL));
