-- What the agency reported beyond the status: the refund it approved or sent (which can differ
-- from the amount claimed), the balance due, and its message to the taxpayer. NULL means
-- "as filed" / nothing to say.
ALTER TABLE tax_returns
  ADD COLUMN agency_refund_cents bigint,
  ADD COLUMN agency_owed_cents   bigint,
  ADD COLUMN agency_message      text;
