-- 260618 UAT fix: push subscriptions must be PER-BUDGET, not per-device.
--
-- Before: push_subscriptions had a GLOBAL unique(endpoint). A device endpoint
-- could therefore exist under exactly ONE tenant, and the Settings master switch
-- keyed off the browser's device-global getSubscription() — so enabling push in
-- one budget showed "enabled" in EVERY budget (and RLS made delivery only ever
-- work for that single tenant).
--
-- After: unique(endpoint, tenant_id). The SAME device endpoint can hold one row
-- per budget the user opted into; each budget's master reflects whether a row
-- exists for (endpoint, that budget). web-push still delivers to the endpoint;
-- a budget the user never enabled simply has no row → no push, master OFF.

--> statement-breakpoint
DROP INDEX IF EXISTS shared_kernel.push_subscriptions_endpoint_uq;

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_tenant_uq
  ON shared_kernel.push_subscriptions (endpoint, tenant_id);
