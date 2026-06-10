-- Phase 08 Plan 01: push_subscriptions + notification_prefs tables.
-- Hand-authored (drizzle-kit BigInt serialisation bug — established precedent Phases 1/5/6).
-- Tables live in shared_kernel schema (same as idempotency_keys, audit_history, user_keys).

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shared_kernel.push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  user_id     UUID        NOT NULL,
  endpoint    TEXT        NOT NULL,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  locale      TEXT        NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shared_kernel.notification_prefs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  user_id           UUID        NOT NULL,
  budget_id         UUID        NOT NULL,
  notification_type TEXT        NOT NULL,
  enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

--> statement-breakpoint
-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uq
  ON shared_kernel.push_subscriptions (endpoint);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS notification_prefs_user_budget_type_uq
  ON shared_kernel.notification_prefs (user_id, budget_id, notification_type);

--> statement-breakpoint
-- Enable + Force RLS (T-08-01-01)
ALTER TABLE shared_kernel.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_kernel.push_subscriptions FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE shared_kernel.notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_kernel.notification_prefs FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
-- RLS policies: tenant_id ANY(app.tenant_ids) — mirrors idempotency_keys pattern
CREATE POLICY push_subscriptions_tenant_isolation
  ON shared_kernel.push_subscriptions
  AS PERMISSIVE FOR ALL
  TO app_role, worker_role
  USING   (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
CREATE POLICY notification_prefs_tenant_isolation
  ON shared_kernel.notification_prefs
  AS PERMISSIVE FOR ALL
  TO app_role, worker_role
  USING   (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_kernel.push_subscriptions  TO app_role, worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_kernel.notification_prefs TO app_role, worker_role;
