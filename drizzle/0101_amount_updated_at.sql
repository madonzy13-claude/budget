-- 0101: when each wallet's balance / asset's value last changed (user, R6:
-- "updated 5 min ago" under every wallet and asset). A trigger stamps it on
-- ANY path that changes the amount — inline edit, a sale paid into a wallet,
-- the price cron — and only then: a rename is not a fresh balance.
ALTER TABLE budgeting.wallets ADD COLUMN IF NOT EXISTS balance_updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE budgeting.investments ADD COLUMN IF NOT EXISTS value_updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
-- Backfill: a wallet's last audited balance change, else its creation.
UPDATE budgeting.wallets w
   SET balance_updated_at = COALESCE(
     (SELECT max(a.occurred_at) FROM shared_kernel.audit_history a
       WHERE a.entity_type = 'wallet' AND a.entity_id = w.id::text
         AND a.after_jsonb ? 'currentBalance'),
     w.created_at);
--> statement-breakpoint
-- An asset's newest transaction, else its creation.
UPDATE budgeting.investments i
   SET value_updated_at = COALESCE(
     (SELECT max(h.created_at) FROM budgeting.investment_history h
       WHERE h.holding_id = i.id AND h.deleted_at IS NULL),
     i.created_at);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.stamp_wallet_balance_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_balance IS DISTINCT FROM OLD.current_balance THEN
    NEW.balance_updated_at := now();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS wallets_balance_updated ON budgeting.wallets;
--> statement-breakpoint
CREATE TRIGGER wallets_balance_updated BEFORE UPDATE ON budgeting.wallets
  FOR EACH ROW EXECUTE FUNCTION budgeting.stamp_wallet_balance_updated();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.stamp_investment_value_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_price_cents IS DISTINCT FROM OLD.current_price_cents
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.buy_price_cents IS DISTINCT FROM OLD.buy_price_cents THEN
    NEW.value_updated_at := now();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS investments_value_updated ON budgeting.investments;
--> statement-breakpoint
CREATE TRIGGER investments_value_updated BEFORE UPDATE ON budgeting.investments
  FOR EACH ROW EXECUTE FUNCTION budgeting.stamp_investment_value_updated();
