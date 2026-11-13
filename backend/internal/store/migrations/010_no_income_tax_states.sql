-- States a taxpayer can live or work in. Only states with an income tax have a return, a form,
-- and an agency; the others are recorded so the portal can say why no state return is needed.
CREATE TABLE states (
  code        char(2) PRIMARY KEY,
  name        text NOT NULL,
  income_tax  boolean NOT NULL
);
INSERT INTO states (code, name, income_tax) VALUES
  ('CA', 'California', true),
  ('NY', 'New York', true),
  ('FL', 'Florida', false),
  ('TX', 'Texas', false),
  ('WA', 'Washington', false);

ALTER TABLE user_states DROP CONSTRAINT user_states_state_check;
ALTER TABLE user_states ADD CONSTRAINT user_states_state_fkey FOREIGN KEY (state) REFERENCES states(code);
