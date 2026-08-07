-- 0080 — an income can arrive exactly ONCE (260807, user request).
--
-- Incomes were pure rhythms: a cadence and a day, no date anywhere. A bonus, a
-- tax refund or the sale of a car had to be entered as a monthly income the
-- household then remembered to delete — which quietly inflated every "monthly
-- income" figure until they did.
--
-- Unlike a scheduled PAYMENT, an income has no next_due_date to borrow, so the
-- date is a new column. It is required for ONCE and forbidden otherwise: a date
-- on a monthly income would be a second, contradictory answer to "when".
--
-- Once the date has passed the income is gone from every read (the repo filters
-- it out), so no cron has to race the calendar to make the numbers right.

ALTER TABLE budgeting.incomes
  ADD COLUMN IF NOT EXISTS once_date date;

ALTER TABLE budgeting.incomes
  DROP CONSTRAINT IF EXISTS incomes_cadence_chk;
ALTER TABLE budgeting.incomes
  ADD CONSTRAINT incomes_cadence_chk
  CHECK (cadence IN ('ONCE','DAILY','WEEKLY','MONTHLY','YEARLY'));

-- The date and the cadence have to agree, or a later reader has to guess which
-- of them is the truth.
ALTER TABLE budgeting.incomes
  DROP CONSTRAINT IF EXISTS incomes_once_date_chk;
ALTER TABLE budgeting.incomes
  ADD CONSTRAINT incomes_once_date_chk
  CHECK (
    (cadence = 'ONCE' AND once_date IS NOT NULL)
    OR (cadence <> 'ONCE' AND once_date IS NULL)
  );

-- A one-time income carries no anchor, weekday or month. The existing
-- cadence_anchor check already ends in a bare "IS NULL" branch and the
-- yearly_month check already reads "cadence <> 'YEARLY' AND NULL", so both
-- accept it unchanged; weekly_dow has always allowed NULL for any cadence.
