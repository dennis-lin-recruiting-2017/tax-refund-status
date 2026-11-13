-- Support agents answer taxpayer questions: they can see every taxpayer's residency and where each
-- return stands, but can't change anything and don't file returns.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('taxpayer', 'admin', 'support'));
