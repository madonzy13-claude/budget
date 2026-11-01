-- 0102 (user, R6): "updated … ago" tracks the AMOUNT only. A currency switch
-- (which converts the figure) or an edited buy price is not a new amount.
CREATE OR REPLACE FUNCTION budgeting.stamp_wallet_balance_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_balance IS DISTINCT FROM OLD.current_balance
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    NEW.balance_updated_at := now();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.stamp_investment_value_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.current_price_cents IS DISTINCT FROM OLD.current_price_cents
      OR NEW.quantity IS DISTINCT FROM OLD.quantity)
     AND NEW.current_price_currency IS NOT DISTINCT FROM OLD.current_price_currency THEN
    NEW.value_updated_at := now();
  END IF;
  RETURN NEW;
END $$;
