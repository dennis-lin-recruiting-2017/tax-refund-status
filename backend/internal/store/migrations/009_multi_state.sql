-- A taxpayer can file in several states: at most one as a full resident, and any others as a
-- part-year resident or nonresident. The residency decides the form: CA 540 or 540NR, NY IT-201
-- or IT-203.
CREATE TABLE user_states (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state      char(2) NOT NULL CHECK (state IN ('CA', 'NY')),
  residency  text NOT NULL CHECK (residency IN ('resident', 'part_year', 'nonresident')),
  PRIMARY KEY (user_id, state)
);
CREATE UNIQUE INDEX user_states_one_resident_idx ON user_states (user_id) WHERE residency = 'resident';

INSERT INTO user_states (user_id, state, residency) SELECT id, state, 'resident' FROM users;
ALTER TABLE users DROP COLUMN state;

-- Still one return per state per year: a taxpayer files either the resident or the
-- nonresident form for a state, never both.
ALTER TABLE tax_returns DROP CONSTRAINT tax_returns_form_check;
ALTER TABLE tax_returns ADD CONSTRAINT tax_returns_form_check
  CHECK (form IN ('1040', '540', '540NR', 'IT-201', 'IT-203'));
