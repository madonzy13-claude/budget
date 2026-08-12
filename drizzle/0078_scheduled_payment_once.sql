-- 0078 — a scheduled payment may happen exactly ONCE (260807, user request).
--
-- Everything the table could hold until now had a rhythm. A one-time payment
-- — a sofa, a deposit, a one-off repair — had to be faked as a yearly rule the
-- household then remembered to delete.
--
-- ONCE is modelled as a payment whose DEADLINE is its own date, so the end-date
-- machinery added in 0069 carries the whole lifecycle: the generation loop stops
-- at end_date, and the engine deactivates the row once the next occurrence is
-- past it. That is why only the cadence check moves here.
--
-- The other three checks already tolerate it, deliberately and not by accident:
--   weekly_dow_chk     — NULL is allowed for any cadence
--   yearly_month_chk   — its first branch is "cadence <> 'YEARLY' AND NULL"
--   cadence_anchor_chk — its last branch is a bare "cadence_anchor IS NULL"
-- so a ONCE row with three NULLs satisfies all of them unchanged.

ALTER TABLE budgeting.scheduled_payments
  DROP CONSTRAINT IF EXISTS scheduled_payments_cadence_chk;

ALTER TABLE budgeting.scheduled_payments
  ADD CONSTRAINT scheduled_payments_cadence_chk
  CHECK (cadence IN ('ONCE','DAILY','WEEKLY','MONTHLY','YEARLY'));
