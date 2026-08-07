-- 0079 — tell a DELETED scheduled payment apart from a RETIRED one (260807).
--
-- Two rows could both be "not running" and the schema could not say which was
-- which: deleting a payment set active = false, and so did the engine when a
-- payment reached its deadline. That was harmless while the list only ever
-- showed active rows — but a one-time payment has to STAY visible once it has
-- happened (disabled, at the bottom), and showing every inactive row would have
-- resurrected everything the household had ever deleted.
--
-- deleted_at is the distinction, and it is the honest one: retirement is
-- something the payment did, deletion is something a person did.
--
-- Nullable with no backfill on purpose. Every existing inactive row is either a
-- past deletion or a past retirement and there is no evidence left to tell them
-- apart; treating them all as retired keeps them visible, which is recoverable
-- (delete it again), while treating them all as deleted would hide history the
-- household never asked to lose.

ALTER TABLE budgeting.scheduled_payments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- The list reads "everything not deleted" on every Settings open.
CREATE INDEX IF NOT EXISTS scheduled_payments_live_idx
  ON budgeting.scheduled_payments (tenant_id) WHERE deleted_at IS NULL;
