-- 0069_recurring_rule_end_date.sql
-- Optional "last date" for a recurring rule. NULL = no deadline (runs forever).
-- A value = generate drafts only up to and including that date, then the
-- generation loops deactivate the rule.
--
-- No CHECK against next_due_date: that column advances as drafts materialise
-- (and briefly steps past end_date before the loop deactivates the rule), so a
-- CHECK would fight the engine. "end_date >= first due date" is enforced at the
-- application boundary (route + form) instead, where "first due date" is known.

ALTER TABLE budgeting.recurring_rules
  ADD COLUMN end_date date;
