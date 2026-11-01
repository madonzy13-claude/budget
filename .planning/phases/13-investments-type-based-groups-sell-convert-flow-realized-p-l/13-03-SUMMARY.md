---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 03
subsystem: database
tags: [migration, rls, demo, gdpr, tenant-leak]
key-files:
  created:
    - drizzle/0087_investment_history.sql
    - packages/investments/src/adapters/persistence/history-schema.ts
    - apps/api/test/schema/investment-history-0087.test.ts
    - tests/tenant-leak/investment-history-cross-tenant.test.ts
  modified:
    - drizzle/meta/_journal.json
    - apps/migrator/post-migration.sql
    - packages/investments/src/adapters/persistence/investments-schema.ts
    - packages/tenancy/src/adapters/persistence/schema.ts
    - packages/platform/src/demo/manifest.ts
    - packages/identity/src/adapters/persistence/better-auth.ts
    - tests/tenant-leak/USER-DATA-TABLES.txt
requirements-completed: [D-05, D-06, D-09, D-10, D-11, D-12, D-20]
---

# 13-03 Summary: Migration 0087 + registries

- `budgeting.investment_history` per plan schema (7 kinds, deltas, flow, frozen realized, value_delta, deposit prior state, transfer_id, soft delete), ENABLE+FORCE RLS, tenant policy, grants (also in post-migration.sql).
- ui_type merge: equity/etf/reit → stocks, etb → treasury_bond, null → derived. New 12-value CHECK.
- `tenancy.budgets.investment_type_order text[]` (D-12).
- Start backfill for every current non-possession holding with a buy price.
- Registered in: tenant-leak list + probe, GDPR TENANT_TABLES, demo manifest (cents money0, qty money4, transfer_id REMAP_ID so legs stay paired) + DEMO_COPY_ORDER after investments.

## Live dev DB (2026-10-26)
Backup: scratchpad `investments-pre-0087.sql` (47.8K) taken before migrate.
Before: equity 10 (5 active), etf 5 (1 active), rest unchanged.
After: stocks 15, legacy/null 0; eligible holdings 60 = distinct Start holdings 60 = rows 60; both FORCE RLS flags true; budgets.investment_type_order ARRAY.
Tests: schema gate + history cross-tenant + force-rls-on-all-tables → 14 pass / 0 fail. Demo preflight/copy 35/0.

## Deviations
- [Rule 1 bug] First migrate failed 23514: the UPDATE to 'stocks' ran under the OLD CHECK. Moved DROP CONSTRAINT before the UPDATE (fix commit). Migration had rolled back atomically; verified before retry.
- Schema test is catalog-only (FORCE RLS hides rows from migrator role); data counts verified via psql as postgres above.

## Interim state
Deployed api/web are pre-phase-13 builds; editing a stocks holding from the old bundle (ui_type 'equity') now fails the CHECK until the rebuild in 13-06+.

## Self-Check: PASSED
