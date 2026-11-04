-- New York joins federal and California.
ALTER TABLE tax_returns DROP CONSTRAINT tax_returns_jurisdiction_check;
ALTER TABLE tax_returns ADD CONSTRAINT tax_returns_jurisdiction_check CHECK (jurisdiction IN ('federal', 'CA', 'NY'));
ALTER TABLE tax_returns DROP CONSTRAINT tax_returns_form_check;
ALTER TABLE tax_returns ADD CONSTRAINT tax_returns_form_check CHECK (form IN ('1040', '540', 'IT-201'));

-- The state a taxpayer files in, which decides which state form the portal offers.
ALTER TABLE users ADD COLUMN state char(2) NOT NULL DEFAULT 'CA' CHECK (state IN ('CA', 'NY'));
