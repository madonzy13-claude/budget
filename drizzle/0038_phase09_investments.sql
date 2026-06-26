-- Phase 9: Investments Wallet — schema foundation.
-- Hand-authored (drizzle-kit BigInt serialization bug forbids `generate`; STATE.md
-- Plan 06-01 / 0024 precedent). This is the SINGLE phase-9 migration — it also carries
-- the delisted-task dedup index (T-9-11, consumed by 09-04 emit) and the api_rate_limits
-- counter table (T-9-16 / INV-14, consumed by 09-06 fetch-instrument-price). No 0039.
--
-- Idempotent throughout (IF NOT EXISTS / DROP IF EXISTS) — the dev DB may be re-run.
-- ENABLE RLS + the tenant-isolation policy on budgeting.investments live here;
-- FORCE ROW LEVEL SECURITY + the table/role GRANTs are in apps/migrator/post-migration.sql.

--> statement-breakpoint
-- Pitfall 5: pg_trgm MUST exist before the trigram GIN index below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

--> statement-breakpoint
-- INV (feature flag): opt-in, default false — unlike reserves/cushion which default true.
ALTER TABLE tenancy.budgets
  ADD COLUMN IF NOT EXISTS investments_enabled boolean NOT NULL DEFAULT false;

--> statement-breakpoint
-- Reference data (no RLS; grants in post-migration.sql). Created before investments
-- and the price tables because they FK to it.
CREATE TABLE IF NOT EXISTS budgeting.instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  display_name text NOT NULL,
  provider text NOT NULL,
  asset_class text NOT NULL,
  quote_currency text,
  active boolean NOT NULL DEFAULT true,
  refresh_cadence text NOT NULL DEFAULT 'hourly',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instruments_asset_class_chk
    CHECK (asset_class IN ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other')),
  CONSTRAINT instruments_refresh_cadence_chk
    CHECK (refresh_cadence IN ('hourly','daily'))
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS instruments_symbol_provider_uidx
  ON budgeting.instruments (symbol, provider);

--> statement-breakpoint
-- D-04 / Pitfall 5: local trigram search (search hits Postgres, never a provider).
CREATE INDEX IF NOT EXISTS instruments_search_gin
  ON budgeting.instruments USING GIN ((symbol || ' ' || display_name) gin_trgm_ops);

--> statement-breakpoint
-- Latest fetched price per instrument (one row per instrument).
CREATE TABLE IF NOT EXISTS budgeting.instrument_price_cache (
  instrument_id uuid PRIMARY KEY REFERENCES budgeting.instruments(id) ON DELETE CASCADE,
  price numeric(28,8) NOT NULL,
  currency char(3) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint
-- Daily historical price points per instrument.
CREATE TABLE IF NOT EXISTS budgeting.instrument_price_snapshots (
  instrument_id uuid NOT NULL REFERENCES budgeting.instruments(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  price numeric(28,8) NOT NULL,
  currency char(3) NOT NULL,
  PRIMARY KEY (instrument_id, snapshot_date)
);

--> statement-breakpoint
-- Tenant-scoped holdings. Money as bigint cents; quantity numeric(28,8) for fractional
-- shares/crypto. instrument_id NULL = custom/cash holding.
CREATE TABLE IF NOT EXISTS budgeting.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  budget_id uuid NOT NULL REFERENCES tenancy.budgets(id) ON DELETE CASCADE,
  instrument_id uuid REFERENCES budgeting.instruments(id),
  name text NOT NULL,
  holding_type text NOT NULL,
  group_name text,
  buy_price_cents bigint,
  buy_currency char(3),
  quantity numeric(28,8) NOT NULL,
  current_price_cents bigint,
  current_price_currency char(3),
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investments_holding_type_chk
    CHECK (holding_type IN ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other'))
);

--> statement-breakpoint
ALTER TABLE budgeting.investments ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
-- T-9-01: tenant isolation, copied verbatim from wallets_tenant_isolation.
DROP POLICY IF EXISTS investments_tenant_isolation ON budgeting.investments;
CREATE POLICY investments_tenant_isolation ON budgeting.investments
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING      (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
-- Hourly price-refresh job scans only active, tracked holdings.
CREATE INDEX IF NOT EXISTS investments_active_instrument_idx
  ON budgeting.investments (instrument_id)
  WHERE archived_at IS NULL AND instrument_id IS NOT NULL;

--> statement-breakpoint
-- Pitfall 1: Postgres cannot ALTER a CHECK in place — DROP then ADD. Adds the 4th kind
-- INVESTMENT_INSTRUMENT_DELISTED (INV-01 / A1); nothing removed.
ALTER TABLE budgeting.tasks DROP CONSTRAINT IF EXISTS tasks_kind_chk;

--> statement-breakpoint
ALTER TABLE budgeting.tasks
  ADD CONSTRAINT tasks_kind_chk
  CHECK (kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET','INVESTMENT_INSTRUMENT_DELISTED'));

--> statement-breakpoint
-- T-9-11: at most one OPEN delisted task per holding. The daily seed job re-runs daily;
-- without this index each run would INSERT another open task for the same delisted holding.
-- 09-04 emit targets this via ON CONFLICT DO NOTHING. Mirrors 0026 tasks_confirm_draft_pending_uq.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_investment_delisted_dedup_idx
  ON budgeting.tasks ((payload_json->>'holding_id'))
  WHERE kind = 'INVESTMENT_INSTRUMENT_DELISTED' AND status = 'PENDING';

--> statement-breakpoint
-- T-9-16 / INV-14: per-user-global throttle backing the on-add instant fetch (10/user/min).
-- NOT tenant-scoped, NO RLS (no tenant data). 09-06 upserts an atomic server-side counter
-- per user per minute window. user_id is uuid (identity.users.id + all *.user_id columns).
CREATE TABLE IF NOT EXISTS budgeting.api_rate_limits (
  user_id uuid NOT NULL,
  window_min timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_min)
);
