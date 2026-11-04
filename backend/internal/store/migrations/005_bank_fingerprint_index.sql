-- Duplicate screening first narrows to returns paying into the same bank account, then compares
-- figures with pgvector. This index makes the exact match fast.
CREATE INDEX tax_returns_bank_fingerprint_idx ON tax_returns (jurisdiction, bank_fingerprint);
