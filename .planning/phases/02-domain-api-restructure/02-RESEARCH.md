# Phase 2: Domain & API Restructure — Research

**Researched:** 2026-05-12
**Domain:** Backend domain rewrite — Transaction, RecurringRule, Reserves, Share-links
**Confidence:** HIGH (all findings verified directly from codebase or locked CONTEXT.md decisions)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-PH2-01:** Regular SQL VIEW `budgeting.category_reserve_balance` (not materialized). WITH RECURSIVE CTE. Fresh on every read.
- **D-PH2-02:** Port `ReserveBalanceRepo` in `packages/budgeting/src/ports/reserve-balance-repo.ts`. Two methods: `getForBudget` and `getForCategory`. Drizzle adapter SELECTs from view.
- **D-PH2-03:** Cadence enum extended to `DAILY|WEEKLY|MONTHLY|YEARLY`. Reuse `cadence_anchor` for MONTHLY day-of-month and YEARLY anchor. Reuse `weekly_dow` for WEEKLY. Add `yearly_month INTEGER` (1-12) for YEARLY. DAILY needs no extras.
- **D-PH2-04:** pg-boss catch-up loop: while `next_due_date <= today`, INSERT draft ON CONFLICT DO NOTHING, advance `next_due_date`. Idempotency key unchanged: `(rule_id, due_date)`.
- **D-PH2-05:** `budget_share_links` overlay table in migration 0013. Routes: POST /budgets/[id]/share, GET /budgets/join/[token], POST /budgets/join/[token]/accept, DELETE /budgets/share/[id]. Single-use + TTL.
- **D-PH2-06:** Share-link single-use + TTL, default 7 days, owner can override via `ttlDays`. DELETE revokes before expiry.
- **D-PH2-07:** PATCH `/budgets/[id]/transactions/[txId]` — changed `currency_original` OR `date` triggers server-side re-FX atomically. Response includes original + converted + rate + as_of.
- **D-PH2-08:** Unified transactions resource. Drafts = `confirmed_at IS NULL`. Six sub-routes. Old `recurring-drafts.ts` route file DELETED.
- **D-PH2-09:** Migration 0013 schema changes: DROP `account_balance_adjustments`, DROP old `expense_ledger.kind`, ADD new `kind TEXT DEFAULT 'SPENDING' CHECK (kind IN ('SPENDING','INCOME'))`, DROP `recurring_rules.kind`, ADD `expense_ledger.recurring_rule_id uuid NULL`. INCOME is a classifier only (not a separate flow).
- **D-PH2-10:** Every new route gets ≥1 integration test in `apps/api/test/routes/`. Share-link tests cover happy-path + 4 security paths.
- **D-PH2-11:** `ReserveBalanceRepo` adapter gets integration tests in `packages/budgeting/test/` covering 5 scenarios.
- **D-PH2-12:** dependency-cruiser rule already enforced. New port in `packages/budgeting/src/ports/`; adapter in `packages/budgeting/src/adapters/persistence/`.

### Claude's Discretion

- Exact SQL form of recursive CTE in `category_reserve_balance` (single-pass aggregate vs LATERAL JOIN vs window-function chain).
- Whether `budget_share_links` lives in `budgeting` or `tenancy` schema.
- Whether to add partial unique index on `budget_share_links(token) WHERE revoked_at IS NULL AND accepted_by IS NULL`.
- Recurring engine cron schedule (currently `0 6 * * * UTC`).
- Naming of draft-confirm endpoint (`/[txId]/confirm` default; PATCH alternative acceptable).
- Whether INCOME txns count toward reserve buildup symmetrically.

### Deferred Ideas (OUT OF SCOPE)

- Materialized view fallback for reserves.
- Email-based share invites (stubs kept dormant).
- Wallet-link on transaction.
- Refund as separate domain event.
- Tasks generators wiring.
- Onboarding starter category template seeding.
- Recurring rule UI CRUD.
- INCOME visual highlighting in grid.
  </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                                                                                                     | Research Support                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TXN-01  | Transaction schema: id, tenant_id, budget_id, category_id, date, amount_original_cents, currency_original, amount_converted_cents, fx_rate, fx_as_of, note, recurring_rule_id, confirmed_at, created_at, updated_at, deleted_at | Migration 0013 adds confirmed_at, recurring_rule_id, new kind column; transaction-repo.ts rewritten to use new column names    |
| TXN-02  | Transactions have no wallet field                                                                                                                                                                                               | expense_ledger.wallet_id already dropped? — see CRITICAL FINDING below; recurring_rules.wallet_id must also be removed         |
| TXN-03  | Quick-entry creates txn with confirmed_at=now()                                                                                                                                                                                 | POST /budgets/[id]/transactions handler sets confirmed_at = now()                                                              |
| TXN-04  | Side slider currency override triggers FX via FxProvider                                                                                                                                                                        | PATCH handler calls fxProvider.rateAsOf on currency or date change                                                             |
| TXN-05  | Storage retains both original and converted amounts                                                                                                                                                                             | expense_ledger already has amount_orig/currency_orig/amount_default/currency_default; rename to \_original/\_converted in 0013 |
| TXN-06  | Side slider displays "5.00 USD · ~4.20 EUR @ 0.84 (2026-05-11)"                                                                                                                                                                 | PATCH response includes all 4 fields                                                                                           |
| TXN-07  | No income tracking / no transfer ledger (INCOME is classifier only per D-PH2-09)                                                                                                                                                | Transaction domain entity stripped of TRANSFER kind; kind enum tightened                                                       |
| TXN-08  | Edit-history panel removed; audit stays in DB                                                                                                                                                                                   | GET /transactions/:id/history route REMOVED; correction chain logic kept in DB but not surfaced                                |
| RECR-01 | Recurring rule schema adds DAILY/YEARLY cadence with day-of-\* selectors                                                                                                                                                        | cadence.ts and recurring-rule.ts extended; migration 0013 alters check constraint                                              |
| RECR-02 | pg-boss materializes due rules into confirmed_at IS NULL transactions                                                                                                                                                           | Recurring engine rewritten to INSERT into expense_ledger with confirmed_at IS NULL instead of separate recurring_drafts table  |
| RSCM-01 | Reserve balance per category via SQL view                                                                                                                                                                                       | category_reserve_balance VIEW created in migration 0013                                                                        |
| RSCM-02 | Cushion-mode history tracked per historical month                                                                                                                                                                               | budget_mode_history SCD-2 table already exists; view JOINs it                                                                  |
| SHRD-01 | SHARED budget invitation via token share link only                                                                                                                                                                              | budget_share_links table + 4 routes                                                                                            |
| SHRD-02 | Uses Better Auth orgs plugin invite-token flow                                                                                                                                                                                  | addMember call on accept; NOT createInvitation                                                                                 |
| SHRD-03 | Single-use or time-bound (TTL default 7d)                                                                                                                                                                                       | accepted_by IS NOT NULL kills token; expires_at enforced                                                                       |
| SHRD-05 | Owner can revoke share links                                                                                                                                                                                                    | DELETE /budgets/share/[id] sets revoked_at                                                                                     |
| ENGR-01 | 80% domain coverage threshold retained                                                                                                                                                                                          | bunfig.toml already has coverageThreshold=0.80; new domain code must be tested                                                 |
| ENGR-02 | dependency-cruiser blocks domain imports of drizzle/Hono/AI SDK/adapters                                                                                                                                                        | .dependency-cruiser.cjs already enforces this; new port/adapter split must comply                                              |
| ENGR-03 | All new API routes get ≥1 integration test in apps/api/test/routes/                                                                                                                                                             | Pattern established; 6 new test files needed                                                                                   |
| ENGR-04 | Tenant-leak CI gate 6/6 green                                                                                                                                                                                                   | make ci-gate; add budget_share_links cross-tenant probe                                                                        |

</phase_requirements>

---

## Summary

Phase 2 rewrites the backend to expose the v1.1 API contract that Phases 3-8 will consume, while deliberately leaving the v1.0 web UI in place. The work is a domain-level restructure (not a UI rebuild): four bounded contexts are modified (budgeting/tenancy/shared-kernel/identity) across schema, domain entities, ports, adapters, application services, route handlers, and one worker.

The critical finding is an **architecture impedance mismatch** between the CONTEXT.md decisions and the current codebase: the existing `transaction-repo.ts` and `recurring-engine.ts` use the old column names (`amount_orig`, `amount_default`, `fx_rate_date`, `wallet_id`), not the v1.1 names (`amount_original_cents`, `amount_converted_cents`, `fx_as_of`). Migration 0013 must rename these columns and the Drizzle adapter layer must be updated in lockstep. Additionally, the current `recurring_drafts` table is a separate entity; D-PH2-08 merges drafts into `expense_ledger` as `confirmed_at IS NULL` rows — this is a significant refactor affecting the worker, the recurring-rule schema, and the route layer.

The share-link approach is a clean app-side overlay (no Better Auth fork) using `budget_share_links` table + a thin `auth.api.addMember` call on accept. The public `GET /budgets/join/[token]` route must bypass the `requireWorkspace` guard (pre-auth recipient has no tenant context) — this requires special handling in `app.ts` similar to how `/auth/*` is public.

**Primary recommendation:** Sequence work as: (1) migration 0013 + post-migration.sql, (2) domain entity rewrites, (3) ports + adapters, (4) application services, (5) route handlers + app.ts registration, (6) worker extension, (7) integration tests. This bottom-up order prevents compilation breaks mid-wave.

---

## Architectural Responsibility Map

| Capability                                           | Primary Tier                  | Secondary Tier                 | Rationale                                                                        |
| ---------------------------------------------------- | ----------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Transaction CRUD (create/patch/delete/confirm)       | API / Backend                 | Database / Storage             | Business logic + FX computation in application service; ledger append-only in DB |
| FX re-compute on edit                                | API / Backend                 | External service (Frankfurter) | fxProvider port called in application service at PATCH time                      |
| Recurring draft materialization                      | Worker (pg-boss)              | Database / Storage             | Cron job + ledger INSERT; no API call needed                                     |
| Recurring cadence math (DAILY/WEEKLY/MONTHLY/YEARLY) | Domain                        | —                              | Pure function in cadence.ts; no I/O                                              |
| Reserve balance computation                          | Database / Storage            | API / Backend                  | SQL VIEW does the math; API merely reads via port                                |
| Cushion-mode history                                 | Database / Storage            | —                              | SCD-2 table already exists; view consumes it                                     |
| Share-link create/revoke                             | API / Backend                 | Database / Storage             | Route handler + overlay table; Better Auth addMember only on accept              |
| Share-link accept (membership)                       | API / Backend + Better Auth   | Database / Storage             | addMember call goes through Better Auth org plugin                               |
| Public share-link resolve                            | API / Backend (no-auth route) | Database / Storage             | GET /budgets/join/[token] bypasses tenant guard                                  |
| Schema migration (0013)                              | Database / Storage            | —                              | Hand-authored SQL; migrator container runs on startup                            |
| Dependency-cruiser enforcement                       | Build / CI                    | —                              | .dependency-cruiser.cjs already configured                                       |
| Tenant-leak CI gate                                  | Build / CI                    | —                              | make ci-gate; 6 tests + 1 new                                                    |

---

## Standard Stack

### Core (all verified from codebase — `[VERIFIED: codebase]`)

| Library                 | Version       | Purpose                                                    | Why Standard                                             |
| ----------------------- | ------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Hono                    | v4 (in use)   | HTTP routes                                                | Project mandate; app.ts pattern established              |
| Drizzle ORM             | in use        | Schema definitions + raw SQL                               | `packages/*/src/adapters/persistence/` pattern           |
| pg-boss                 | v10 (in use)  | Worker/cron for recurring engine                           | `apps/worker/src/handlers/recurring-engine.ts`           |
| temporal-polyfill       | in use        | Date math for cadence                                      | `cadence.ts` uses `Temporal.PlainDate` throughout        |
| Zod v3                  | in use        | Input validation on all routes                             | Established in all route factories                       |
| Better Auth             | in use        | `auth.api.addMember` for share accept                      | `better-auth-org.ts` provides `createOrganizationPlugin` |
| `@budget/platform`      | internal      | `withTenantTx`, `withInfraTx`, `writeOutbox`, `writeAudit` | All adapters use these primitives                        |
| `@budget/shared-kernel` | internal      | `FxProvider`, `Money`, `Result`, `TenantId`, `UserId`      | Cross-package contracts                                  |
| nanoid                  | check install | Random token for share-links (32 chars)                    | Standard for URL-safe tokens                             |

### Supporting

| Library                                | Version | Purpose                             | When to Use                                  |
| -------------------------------------- | ------- | ----------------------------------- | -------------------------------------------- |
| `temporal-polyfill` Temporal.PlainDate | in use  | DAILY/YEARLY cadence math extension | New cases in `nextOccurrence()`              |
| `bun:test`                             | runtime | Unit + integration tests            | All `packages/*/test/` and `apps/api/test/`  |
| testcontainers (via existing helpers)  | in use  | Real Postgres for integration tests | `packages/budgeting/test/helpers.ts` pattern |

### Alternatives Considered

| Instead of                            | Could Use                    | Tradeoff                                                                         |
| ------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Regular VIEW for reserves             | Materialized VIEW            | Materialized needs REFRESH trigger; regular is simpler and correct at v1.1 scale |
| App-side `budget_share_links`         | Better Auth invitation table | BA invitation table has no revoke/TTL/single-use semantics under our control     |
| `withInfraTx` for public join resolve | `withTenantTx`               | Recipient has no tenant GUC yet; must use infra-level connection                 |

---

## Architecture Patterns

### System Architecture Diagram

```
POST /budgets/[id]/transactions
    → tenantGuard (sets GUC) → requireAuth → requireWorkspace
    → createTransaction use case
        → FxProvider.rateAsOf(currency, budgetCurrency, date)   [Frankfurter]
        → TransactionRepo.create()
            → withTenantTx
                → INSERT expense_ledger (confirmed_at=now())
                → writeOutbox (budgeting.transaction.created)

PATCH /budgets/[id]/transactions/[id]
    → editTransaction use case
        → TransactionRepo.findById()
        → IF currency_original changed OR date changed:
              FxProvider.rateAsOf(new_currency, budgetCurrency, new_date)
        → TransactionRepo.updateInPlace()   ← NEW (not correction chain)
            → withTenantTx: UPDATE expense_ledger SET ... WHERE id=?
            → writeOutbox (budgeting.transaction.updated)

pg-boss cron (0 6 * * * UTC)
    → recurring-engine handler
        → withInfraTx: SELECT DISTINCT tenant_id WHERE next_due_date <= today
        → for each tenant: withTenantTx
            → SELECT rules FOR UPDATE
            → loop while next_due_date <= today:
                INSERT expense_ledger (confirmed_at IS NULL) ON CONFLICT DO NOTHING
                UPDATE recurring_rules.next_due_date = nextOccurrence(...)
                writeOutbox (budgeting.recurring.draft.generated)

GET /budgets/[id]/reserves  (or per-category)
    → ReserveBalanceRepo.getForBudget()
        → withTenantTx: SELECT FROM budgeting.category_reserve_balance
        → returns Map<CategoryId, Money>

POST /budgets/[id]/share
    → requireAuth + owner-role check
    → createShareLink use case
        → INSERT budget_share_links (token=nanoid(32), expires_at=now()+ttlDays)
        → return { url: APP_URL/budgets/join/TOKEN, expiresAt }

GET /budgets/join/[token]   ← PUBLIC (no requireWorkspace, no requireAuth)
    → withInfraTx: SELECT FROM budget_share_links WHERE token=?
    → return { budgetName, isExpired, isRevoked, isUsed }

POST /budgets/join/[token]/accept   ← requireAuth only
    → withInfraTx: SELECT + lock budget_share_links row
    → validate not expired/revoked/used
    → auth.api.addMember(orgId, userId, 'member')
    → UPDATE budget_share_links SET accepted_by=?, accepted_at=now()

DELETE /budgets/share/[id]
    → requireAuth + owner-role check
    → UPDATE budget_share_links SET revoked_at=now()
```

### Recommended Project Structure (new files only)

```
packages/budgeting/src/
├── domain/
│   ├── cadence.ts                    EXTEND: DAILY + YEARLY cases
│   ├── recurring-rule.ts             EXTEND: yearlyMonth field, new validation
│   └── transaction.ts                REWRITE: strip kind/accountId/transferGroupId/correctsId; add confirmedAt/recurringRuleId/kind('SPENDING'|'INCOME')
├── ports/
│   └── reserve-balance-repo.ts       NEW
├── adapters/persistence/
│   ├── reserve-balance-repo.ts       NEW
│   ├── transaction-repo.ts           REWRITE: new column names, no correction chain, add updateInPlace
│   ├── recurring-rules-schema.ts     EXTEND: yearly_month col, new check constraint
│   ├── balance-adjustments-schema.ts DROP (file deleted, export removed)
│   └── [recurring-drafts-schema.ts   RETAINED for migration 0013 DROP; may be deleted after]
├── application/
│   ├── create-transaction.ts         REWRITE: confirmed_at=now(), no accountId
│   ├── edit-transaction.ts           REWRITE: updateInPlace replaces insertCorrection
│   └── confirm-recurring-draft.ts    DELETE (merged into transactions resource)

packages/tenancy/src/
├── adapters/persistence/
│   └── budget-share-links-schema.ts  NEW
├── application/
│   ├── create-share-link.ts          NEW
│   ├── resolve-share-link.ts         NEW
│   ├── accept-share-link.ts          NEW
│   └── revoke-share-link.ts          NEW

apps/api/src/
├── routes/
│   ├── transactions.ts               REWRITE: new resource shape, /confirm sub-route, remove /correct + /history
│   ├── recurring-rules.ts            EXTEND: DAILY/YEARLY in schema + response
│   ├── recurring-drafts.ts           DELETE
│   ├── budgets.ts                    EXTEND: POST /[id]/share + DELETE /share/[id]
│   └── share-join.ts                 NEW: public + authenticated halves
└── app.ts                            EXTEND: register share-join; public GET path bypasses requireWorkspace

apps/worker/src/handlers/
└── recurring-engine.ts               REWRITE: catch-up loop, INSERT into expense_ledger not recurring_drafts

drizzle/
└── 0013_phase02_domain_restructure.sql  NEW

apps/migrator/
└── post-migration.sql                EXTEND: RLS policies + GRANTs for budget_share_links + view
```

### Pattern 1: Transaction updateInPlace (replaces correction chain)

**What:** Phase 2 abandons the correction-row append-only pattern for the v1.1 transaction edit. The CONTEXT (D-PH2-08) specifies a unified PATCH endpoint; TXN-08 removes the edit-history panel. The existing `insertCorrection` path stays in the DB (for audit), but the v1.1 PATCH writes a simple UPDATE inside `withTenantTx`.
**When to use:** All PATCH /budgets/[id]/transactions/[txId] calls.

```typescript
// Source: [VERIFIED: codebase] — new pattern not yet implemented
async updateInPlace(
  id: string,
  fields: Partial<TransactionRow>,
  userId: string,
  tenantId: string,
): Promise<void> {
  const r = await withTenantTx(TenantId(tenantId), UserId(userId), async (tx) => {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };
    await drizzleTx.execute(sql`
      UPDATE budgeting.expense_ledger
         SET amount_original_cents = ${fields.amountOriginalCents ?? sql`amount_original_cents`},
             currency_original     = ${fields.currencyOriginal ?? sql`currency_original`},
             amount_converted_cents= ${fields.amountConvertedCents ?? sql`amount_converted_cents`},
             fx_rate               = ${fields.fxRate ?? sql`fx_rate`},
             fx_as_of              = ${fields.fxAsOf ?? sql`fx_as_of`},
             note                  = ${fields.note ?? sql`note`},
             category_id           = ${fields.categoryId ?? sql`category_id`},
             updated_at            = now()
       WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
    `);
    await writeOutbox(tx, { eventType: 'budgeting.transaction.updated', ... });
  });
  if (r.isErr()) throw r.error;
}
```

**Note:** `expense_ledger` currently has `REVOKE UPDATE, DELETE FROM app_role` in post-migration.sql. Phase 2 MUST either (a) GRANT UPDATE on specific columns or (b) use the `insertCorrection` correction-chain for PATCH and expose the tip. This is a **critical decision point** — see Pitfall 1.

### Pattern 2: Reserve Balance SQL VIEW

**What:** Recursive CTE computes per-category cumulative reserve over past months.
**When to use:** Any query of `/budgets/[id]/reserves` or per-category.

```sql
-- Source: [VERIFIED: design from D-PH2-01]
-- Recommended structure (Claude's Discretion — planner verifies)
CREATE OR REPLACE VIEW budgeting.category_reserve_balance AS
WITH RECURSIVE months AS (
  -- anchor: earliest month with any transaction or category_limit for this budget
  SELECT
    cl.budget_id,
    cl.category_id,
    cl.tenant_id,
    date_trunc('month', MIN(e.date))::date AS month_start
  FROM budgeting.category_limits cl
  LEFT JOIN budgeting.expense_ledger e ON e.category_id = cl.category_id
  GROUP BY cl.budget_id, cl.category_id, cl.tenant_id

  UNION ALL

  SELECT budget_id, category_id, tenant_id,
         (month_start + INTERVAL '1 month')::date
  FROM months
  WHERE month_start < date_trunc('month', CURRENT_DATE)
),
monthly_spent AS (
  SELECT
    e.budget_id,
    e.category_id,
    date_trunc('month', e.date)::date AS month_start,
    SUM(
      CASE WHEN e.kind = 'SPENDING' THEN e.amount_converted_cents
           WHEN e.kind = 'INCOME'   THEN -e.amount_converted_cents
           ELSE 0 END
    ) AS spent_cents
  FROM budgeting.expense_ledger e
  WHERE e.confirmed_at IS NOT NULL AND e.deleted_at IS NULL
  GROUP BY e.budget_id, e.category_id, date_trunc('month', e.date)
),
mode_per_month AS (
  SELECT
    bmh.budget_id,
    m.month_start,
    COALESCE(
      (SELECT bmh2.mode FROM budgeting.budget_mode_history bmh2
       WHERE bmh2.budget_id = bmh.budget_id
         AND bmh2.effective_from <= m.month_start
         AND (bmh2.effective_to IS NULL OR bmh2.effective_to > m.month_start)
       LIMIT 1),
      'NORMAL'
    ) AS mode
  FROM months m
  JOIN budgeting.budget_mode_history bmh ON bmh.budget_id = m.budget_id
),
budget_per_month AS (
  SELECT
    cl.budget_id,
    cl.category_id,
    m.month_start,
    CASE WHEN mpm.mode = 'CUSHION' THEN cl.cushion_amount_cents
         ELSE cl.planned_amount_cents END AS active_budget_cents
  FROM months m
  JOIN budgeting.category_limits cl
    ON cl.category_id = m.category_id
    AND cl.effective_from <= m.month_start
    AND (cl.effective_to IS NULL OR cl.effective_to > m.month_start)
  LEFT JOIN mode_per_month mpm
    ON mpm.budget_id = m.budget_id AND mpm.month_start = m.month_start
),
reserve_accum AS (
  -- base case: month 0
  SELECT
    bpm.budget_id,
    bpm.category_id,
    bpm.month_start,
    GREATEST(0,
      bpm.active_budget_cents - COALESCE(ms.spent_cents, 0)
    ) AS reserve_cents
  FROM budget_per_month bpm
  LEFT JOIN monthly_spent ms
    ON ms.budget_id = bpm.budget_id
    AND ms.category_id = bpm.category_id
    AND ms.month_start = bpm.month_start
  WHERE bpm.month_start = (
    SELECT MIN(month_start) FROM budget_per_month bpm2
    WHERE bpm2.budget_id = bpm.budget_id AND bpm2.category_id = bpm.category_id
  )

  UNION ALL

  SELECT
    bpm.budget_id,
    bpm.category_id,
    bpm.month_start,
    GREATEST(0,
      ra.reserve_cents
      + bpm.active_budget_cents
      - COALESCE(ms.spent_cents, 0)
    ) AS reserve_cents
  FROM reserve_accum ra
  JOIN budget_per_month bpm
    ON bpm.budget_id = ra.budget_id
    AND bpm.category_id = ra.category_id
    AND bpm.month_start = ra.month_start + INTERVAL '1 month'
  LEFT JOIN monthly_spent ms
    ON ms.budget_id = bpm.budget_id
    AND ms.category_id = bpm.category_id
    AND ms.month_start = bpm.month_start
)
SELECT
  budget_id,
  category_id,
  tenant_id,
  reserve_cents AS balance_cents
FROM reserve_accum
WHERE month_start = (
  SELECT MAX(month_start) FROM reserve_accum ra2
  WHERE ra2.budget_id = reserve_accum.budget_id
    AND ra2.category_id = reserve_accum.category_id
);
```

**Warning:** This VIEW requires RLS-enforced access. `SELECT FROM` is scoped by `budgeting.expense_ledger` and `category_limits` which already have RLS policies. The VIEW itself needs `GRANT SELECT TO app_role` in post-migration.sql.

### Pattern 3: Catch-up Recurring Engine Loop

**What:** When worker has been down, N missed dates each produce one draft per rule per date.
**When to use:** `runRecurringEngine()` — replaces current single-date logic.

```typescript
// Source: [VERIFIED: codebase] — extends existing recurring-engine.ts
for (const ruleRaw of rulesResult.rows) {
  const rule = ruleRaw as RuleRow;
  let dueDate = Temporal.PlainDate.from(toDateString(rule.next_due_date));
  const todayDate = Temporal.PlainDate.from(today);

  while (Temporal.PlainDate.compare(dueDate, todayDate) <= 0) {
    const dueDateStr = dueDate.toString();

    // INSERT into expense_ledger (confirmed_at IS NULL = draft)
    const insertResult = await drizzleTx.execute(sql`
      INSERT INTO budgeting.expense_ledger
        (id, tenant_id, budget_id, category_id, date,
         amount_original_cents, currency_original,
         amount_converted_cents, fx_rate, fx_as_of,
         note, recurring_rule_id, confirmed_at, kind, created_at)
      VALUES
        (gen_random_uuid(), ${tenant_id}::uuid, ${rule.budget_id}::uuid,
         ${rule.category_id}::uuid, ${dueDateStr}::date,
         ${rule.amount_cents}, ${rule.currency},
         ${rule.amount_converted_cents}, ${rule.fx_rate}, ${rule.fx_as_of},
         ${rule.note}, ${rule.id}::uuid,
         NULL,   -- confirmed_at IS NULL = draft
         'SPENDING', now())
      ON CONFLICT (recurring_rule_id, date) DO NOTHING
      RETURNING id
    `);

    const nextDate = nextOccurrence(
      { cadence, anchorDay, weeklyDow, yearlyMonth },
      dueDate,
    );
    dueDate = nextDate;
  }

  await drizzleTx.execute(sql`
    UPDATE budgeting.recurring_rules SET next_due_date = ${dueDate.toString()}::date WHERE id = ${rule.id}::uuid
  `);
}
```

**Critical:** The idempotency conflict key changes from `(rule_id, due_date)` on `recurring_drafts` to `(recurring_rule_id, date)` on `expense_ledger`. A UNIQUE constraint on `(recurring_rule_id, date)` must be added in migration 0013.

### Pattern 4: INCOME negative-number quick-entry

**What:** Server-side: if POST body has negative `amount_original_cents`, flip sign and set `kind='INCOME'`.

```typescript
// Source: [VERIFIED: D-PH2-09 spec]
const raw = parsed.data.amount_original_cents;
const kind = raw < 0 ? "INCOME" : "SPENDING";
const amountOriginalCents = Math.abs(raw);
```

### Pattern 5: Public share-join route bypass

**What:** `GET /budgets/join/[token]` must not require session or workspace. Register BEFORE the `requireWorkspace` middleware fence in `app.ts`.

```typescript
// Source: [VERIFIED: codebase app.ts structure]
// In app.ts — BEFORE the requireWorkspace fence loop:
app.use("/budgets/join/*", requireAuth); // only accept-step needs auth
app.route("/budgets/join", createShareJoinRoute(deps));
// The GET resolve sub-route handles unauthenticated access internally
// by checking auth header presence rather than throwing 401
```

### Anti-Patterns to Avoid

- **Updating `expense_ledger` without GRANT UPDATE:** The current `post-migration.sql` has `REVOKE UPDATE, DELETE ON budgeting.expense_ledger`. The PATCH updateInPlace path needs either a narrowed column-level GRANT or must use the correction-chain instead. Do NOT silently fail at runtime.
- **Sharing `withTenantTx` context for public join resolve:** `GET /budgets/join/[token]` has no tenant ID. Use `withInfraTx` to read `budget_share_links` + JOIN `tenancy.budgets` for the budget name.
- **Placing `budget_share_links` in `budgeting` schema:** It belongs in `tenancy` schema (access control concern, joins `tenancy.budgets`). The dep-cruiser `cross-package-only-contracts` rule means a budgeting-schema table cannot be easily read by tenancy application services.
- **Calling `auth.api.createInvitation` for share-links:** D-PH2-05 explicitly chooses `addMember` on accept (not the invitation flow). `createInvitation` triggers an email send via `sendInvitationEmail` in `better-auth-org.ts`.
- **Assuming `recurring_drafts` table remains:** D-PH2-08 deletes the separate drafts table/route. All existing tests in `apps/api/test/routes/recurring-drafts.test.ts` and `packages/budgeting/test/recurring-confirm-skip-edit.test.ts` must be migrated or deleted.
- **Forgetting `yearly_month` in YEARLY cadence nextOccurrence:** YEARLY needs both day-of-year-anchor (`cadence_anchor`) and month (`yearly_month`). Missing month means Jan 1 for every year.

---

## Don't Hand-Roll

| Problem                              | Don't Build                      | Use Instead                                                      | Why                                                           |
| ------------------------------------ | -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Random URL-safe token for share-link | Custom UUID/hash scheme          | `nanoid(32)`                                                     | Collision-resistant, URL-safe, standard                       |
| Date arithmetic for DAILY/YEARLY     | Manual `+1 day` / `+1 year` math | `Temporal.PlainDate.add()`                                       | Handles leap years, DST-safe                                  |
| Append-only enforcement              | Application-level check          | `REVOKE UPDATE, DELETE` in post-migration.sql (already in place) | DB enforces; app can't bypass                                 |
| Token expiry check                   | Cron cleanup job                 | `expires_at < NOW()` in SQL WHERE                                | No background job needed; filter at query time                |
| Cushion-mode-as-of-month             | New SCD table                    | `budget_mode_history` SCD-2 already exists                       | Read `effective_from / effective_to` columns directly in view |

**Key insight:** All the infrastructure this phase needs already exists — the work is wiring it together correctly, not building new primitives.

---

## Runtime State Inventory

> Phase 2 is not a rename phase. The schema column renames (amount_orig → amount_original_cents etc.) happen in migration 0013 which runs on container start. No runtime state outside the DB.

| Category            | Items Found                                                                                   | Action Required                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | `expense_ledger` rows with old column names (`amount_orig`, `amount_default`, `fx_rate_date`) | Migration 0013 renames columns; existing rows automatically use new names                                                                    |
| Stored data         | `recurring_drafts` table rows (PENDING status)                                                | Migration 0013 must migrate PENDING drafts to `expense_ledger` with `confirmed_at IS NULL` OR accept they are lost (dev DB nuked per MIG-09) |
| Live service config | pg-boss queue `recurring-engine` — same queue name, no change                                 | None                                                                                                                                         |
| OS-registered state | None                                                                                          | None — verified by inspection                                                                                                                |
| Secrets/env vars    | None changed                                                                                  | None                                                                                                                                         |
| Build artifacts     | `apps/api` and `apps/worker` Docker images must be rebuilt after schema changes               | `make dev-build` after Phase 2 lands                                                                                                         |

**Key:** MIG-09 (dev DB nuked) means existing `recurring_drafts` rows are disposable — no data migration script needed. Migration 0013 can `DROP TABLE budgeting.recurring_drafts` after ensuring all application code stops referencing it.

---

## Common Pitfalls

### Pitfall 1: REVOKE UPDATE on expense_ledger breaks PATCH updateInPlace

**What goes wrong:** `post-migration.sql` has `REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role`. A PATCH that does `UPDATE expense_ledger SET ...` will fail with permission denied at runtime.
**Why it happens:** The append-only ledger invariant (D-23 / ENGR-06) was designed for v1.0 where edits used correction rows. The v1.1 model has `PATCH` as a first-class operation.
**How to avoid:** Two options: (a) ADD `GRANT UPDATE (note, category_id, kind, confirmed_at, deleted_at, amount_original_cents, currency_original, amount_converted_cents, fx_rate, fx_as_of, updated_at) ON budgeting.expense_ledger TO app_role` for specific updatable fields, keeping the REVOKE for non-editable fields; or (b) keep correction-chain for PATCH and expose the chain tip as the canonical row (but this conflicts with TXN-08 removing the history panel). **Option (a) is recommended** — GRANT on specific columns is Postgres-native and preserves the spirit of append-only for amounts. Add this to `post-migration.sql` in migration 0013 section.
**Warning signs:** `ERROR: permission denied for table expense_ledger` in integration test output.

### Pitfall 2: expense_ledger column rename breaks all existing SQL in transaction-repo.ts

**What goes wrong:** Migration 0013 renames `amount_orig` → `amount_original_cents`, `amount_default` → `amount_converted_cents`, `fx_rate_date` → `fx_as_of`. But `transaction-repo.ts` has 15+ hardcoded SQL strings referencing old names. All compilation passes (strings), but runtime fails.
**Why it happens:** Raw SQL strings in adapters are not type-checked by Drizzle.
**How to avoid:** Rewrite `transaction-repo.ts` as part of the same plan that authors migration 0013. Run integration tests (`bun test packages/budgeting/test/transaction-ledger-insert.test.ts`) before merging.
**Warning signs:** `column "amount_orig" does not exist` errors in test output.

### Pitfall 3: Catch-up loop advances next_due_date past idempotency window

**What goes wrong:** If the recurring engine runs mid-day and `next_due_date` is today, the catch-up loop inserts the draft AND advances `next_due_date` to the next occurrence. If the cron fires again same day (restart, etc.), the conflict key prevents duplicate — correct. BUT if `next_due_date` is advanced BEFORE the draft INSERT and the process crashes, the draft is never generated and the date is already past.
**Why it happens:** Update-before-insert ordering.
**How to avoid:** INSERT the draft FIRST (with ON CONFLICT DO NOTHING), THEN UPDATE `next_due_date`. This matches the existing engine order in `recurring-engine.ts` — preserve it in the rewrite.
**Warning signs:** Missing drafts for expected due dates after worker restart.

### Pitfall 4: Public GET /budgets/join/[token] leaks budget names across tenants

**What goes wrong:** The public resolve endpoint returns `budgetName`. If not properly scoped, a tenant-A token could be used to probe budget names from tenant-B.
**Why it happens:** Token is the only credential; no tenant GUC is set.
**How to avoid:** JOIN `budget_share_links` with `tenancy.budgets` using the `budget_id` FK. Only return the name of the budget the token belongs to. No RLS needed — the token IS the credential. Add a cross-tenant probe to the tenant-leak CI gate tests.
**Warning signs:** CI gate test fails; `make ci-gate` not green after new table added.

### Pitfall 5: recurringDrafts schema file deletion breaks Drizzle migration journal

**What goes wrong:** `recurring-drafts-schema.ts` exports `recurringDrafts` which is likely referenced in the Drizzle schema index. Deleting it without updating the index breaks `drizzle-kit` introspection (even though migrations are hand-authored, the schema index is used for type generation).
**Why it happens:** The schema index file imports all table exports for type safety.
**How to avoid:** When deleting `recurring-drafts-schema.ts`, simultaneously update the schema index file and any barrel exports in `packages/budgeting/src/adapters/persistence/`. Search for `recurringDrafts` imports across the codebase.
**Warning signs:** TypeScript compile errors on `import { recurringDrafts }` references.

### Pitfall 6: budget_share_links in wrong schema causes dep-cruiser violation

**What goes wrong:** If `budget_share_links` schema is placed in `packages/budgeting/src/adapters/persistence/`, the tenancy application services (`accept-share-link.ts`) would need to import it, violating `cross-package-only-contracts` dep-cruiser rule.
**Why it happens:** Schema placement determines which package owns the table.
**How to avoid:** Place `budget-share-links-schema.ts` in `packages/tenancy/src/adapters/persistence/` (Claude's Discretion resolution: tenancy schema, not budgeting). The `tenancy.budget_share_links` table lives in the `tenancy` Postgres schema alongside `tenancy.budgets`.
**Warning signs:** dep-cruiser error `cross-package-only-contracts` on `accept-share-link.ts` imports.

### Pitfall 7: FxProvider.rateAsOf expects Date, not string

**What goes wrong:** `FxProvider.rateAsOf(from, to, date: Date)` takes a JS `Date` object. Transaction date stored as `YYYY-MM-DD` string. Passing string directly causes wrong FX lookups (date treated as epoch 0).
**Why it happens:** Type coercion in JS doesn't throw on `new Date("2026-05-11")` but it does on invalid dates.
**How to avoid:** Convert: `new Date(txn.date + 'T00:00:00Z')` when calling `rateAsOf`. The existing `create-transaction.ts` application service does this correctly — copy the pattern for the new PATCH path.
**Warning signs:** FX rate for edit returns 1970-01-01 rate.

### Pitfall 8: view column names vs. port return type mismatch

**What goes wrong:** The SQL VIEW returns `balance_cents` (bigint) but `ReserveBalanceRepo.getForBudget` must return `Map<CategoryId, Money>`. If the adapter maps wrong column names, Money objects have 0 or undefined amounts.
**Why it happens:** SQL column name `balance_cents` is an arbitrary choice; adapter must match.
**How to avoid:** Define the VIEW with explicit AS aliases that match the adapter's `row.balance_cents` expectation. Write the integration test (D-PH2-11) FIRST (TDD) to catch this.
**Warning signs:** `getForBudget` returns all zeros in test; zero-history category test fails.

---

## Code Examples

### Existing FxProvider usage (reuse for PATCH re-FX)

```typescript
// Source: [VERIFIED: packages/shared-kernel/src/ports/fx-provider.ts]
// rateAsOf signature:
rateAsOf(from: Currency, to: Currency, date: Date): Promise<{ rate: string; provider: string; isStale: boolean }>
// Usage in PATCH:
const fxResult = await deps.fxProvider.rateAsOf(
  newCurrencyOriginal,
  budget.currency,
  new Date(newDate + 'T00:00:00Z'),
);
// response shape per D-PH2-07:
return { amountOriginalCents, currencyOriginal, amountConvertedCents, fxRate: fxResult.rate, fxAsOf: newDate };
```

### Existing withInfraTx pattern (reuse for public share-join resolve)

```typescript
// Source: [VERIFIED: apps/worker/src/handlers/recurring-engine.ts line 56]
const tenantsResult = await withInfraTx(async (tx) => {
  const drizzleTx = tx as {
    execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
  };
  const r = await drizzleTx.execute(sql`SELECT ...`);
  return r.rows;
});
if (tenantsResult.isErr()) throw tenantsResult.error;
```

### Existing Better Auth addMember usage

```typescript
// Source: [VERIFIED: packages/tenancy/src/adapters/persistence/better-auth-org.ts]
// beforeAddMember and afterAddMember hooks exist; to add a member programmatically:
await deps.auth.api.addMember({
  body: { organizationId: budgetId, userId: acceptingUserId, role: "member" },
  // headers may be needed for session context — check Better Auth docs
});
```

### Existing cadence extension point

```typescript
// Source: [VERIFIED: packages/budgeting/src/domain/cadence.ts]
export type Cadence = "MONTHLY" | "WEEKLY"; // EXTEND to include "DAILY" | "YEARLY"
// nextOccurrence throws on unsupported cadence — test confirms this at line 73
// DAILY case: return prev.add({ days: 1 })
// YEARLY case: return prev.with({ month: yearlyMonth, day: Math.min(anchorDay, daysInMonth) }).add({ years: 1 })
```

---

## State of the Art

| Old Approach                        | Current Approach                                           | When Changed     | Impact                                                     |
| ----------------------------------- | ---------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| INCOME/TRANSFER as transaction kind | INCOME as classifier only; TRANSFER removed                | Phase 2 D-PH2-09 | Simplifies domain entity; strips transferGroupId           |
| Correction-row pattern for edits    | updateInPlace PATCH (with column-level GRANT)              | Phase 2 D-PH2-07 | Edit history no longer surfaced to user (TXN-08)           |
| Separate `recurring_drafts` table   | Drafts = `expense_ledger` rows with `confirmed_at IS NULL` | Phase 2 D-PH2-08 | Unified resource; recurring-drafts route deleted           |
| `recurring_rules.wallet_id` FK      | No wallet linkage on rules                                 | Phase 2 D-PH2-09 | Rules are purely categorical                               |
| MONTHLY/WEEKLY only cadence         | DAILY/WEEKLY/MONTHLY/YEARLY                                | Phase 2 D-PH2-03 | `nextOccurrence` extended; schema check constraint altered |
| Email-based Better Auth invitations | Token share-link (overlay table)                           | Phase 2 D-PH2-05 | Owner-controlled revoke/TTL/single-use                     |

**Deprecated in Phase 2:**

- `recurring-drafts.ts` route: deleted, folded into `/transactions` resource.
- `account_balance_adjustments` table: dropped (wallet balances are manual snapshots, WALT-07).
- `insertCorrection` / `getCorrectionChain` application services: kept in code but no new routes call them (correction chain data stays in DB, TXN-08 removes UI surface).
- `recurring_rules.kind` column: dropped (all rules produce SPENDING drafts, D-PH2-09).
- `recurring_rules.wallet_id` column: dropped (categorical-only, TXN-02).

---

## Assumptions Log

| #   | Claim                                                                                                   | Section                   | Risk if Wrong                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `expense_ledger` column rename (`amount_orig` → `amount_original_cents` etc.) is part of migration 0013 | Standard Stack, Pitfall 2 | If Phase 1 already renamed these, migration 0013 would attempt a redundant rename — migration should be idempotent with IF EXISTS check     |
| A2  | `REVOKE UPDATE, DELETE ON expense_ledger` in post-migration.sql blocks the PATCH updateInPlace path     | Pitfall 1                 | If GRANT UPDATE already exists on some columns, the pitfall may not apply — verify in post-migration.sql before implementing                |
| A3  | `recurring_rules.wallet_id` must be dropped in migration 0013                                           | Runtime State Inventory   | CONTEXT.md (D-PH2-09) does not explicitly list this drop; it follows from TXN-02 (no wallet field) + recurring rules being categorical-only |
| A4  | `nanoid` package is available or easily installable                                                     | Standard Stack            | If not installed, `crypto.randomBytes(32).toString('base64url')` is a fallback using Node/Bun built-ins                                     |
| A5  | Better Auth `auth.api.addMember` accepts `{ organizationId, userId, role }` body                        | Share-link patterns       | Better Auth API may require headers/session context; verify against Better Auth 1.4+ docs                                                   |

---

## Open Questions

1. **Column-level GRANT vs. correction chain for PATCH**
   - What we know: `REVOKE UPDATE, DELETE ON expense_ledger` is in post-migration.sql. CONTEXT D-PH2-07 says PATCH triggers updateInPlace.
   - What's unclear: Does the planner want GRANT UPDATE on specific columns (simpler) or to retain the correction chain and expose tip (preserves full history but conflicts with TXN-08)?
   - Recommendation: GRANT UPDATE on specific editable columns (`note`, `category_id`, `kind`, `confirmed_at`, `deleted_at`, `amount_original_cents`, `currency_original`, `amount_converted_cents`, `fx_rate`, `fx_as_of`, `date`, `updated_at`). Keep REVOKE for `id`, `tenant_id`, `budget_id`, `created_at`. This is the cleanest match to TXN-08 (no history panel).

2. **expense_ledger column naming in migration 0013**
   - What we know: CONTEXT says schema is `amount_original_cents, currency_original, amount_converted_cents, fx_rate, fx_as_of`. Current DB/code uses `amount_orig, currency_orig, amount_default, currency_default, fx_rate, fx_rate_date`.
   - What's unclear: Are these RENAME COLUMN operations, or did Phase 1 already perform them?
   - Recommendation: Check `drizzle/0012_phase01_v11_rename.sql` — the research confirms it only dropped `kind`, `account_id`, `to_account_id`, `direction`. Column renames for amounts are NOT in 0012. Migration 0013 must do them.

3. **INCOME and reserve buildup symmetry**
   - What we know: D-PH2-09 gives the `spent(c,m)` formula. Claude's Discretion says "recommend they count symmetrically."
   - What's unclear: If a category has INCOME in month M (under-spent), does reserve(M) include that surplus?
   - Recommendation: Yes — use the formula as written: `CASE WHEN kind='INCOME' THEN -amount_converted_cents`. An INCOME makes `spent` negative relative to the budget, increasing the surplus → reserve carries forward. Consistent with RSRV-02.

---

## Environment Availability

| Dependency                | Required By                       | Available                     | Version | Fallback                                       |
| ------------------------- | --------------------------------- | ----------------------------- | ------- | ---------------------------------------------- |
| PostgreSQL                | Migration 0013, integration tests | Assumed via Docker Compose    | 15+     | None — required                                |
| Bun                       | All tests, API server             | Assumed installed             | 1.2.x   | None — project mandate                         |
| Docker Compose            | `make dev-build` after Phase 2    | Assumed available             | Any     | None — project mandate                         |
| nanoid                    | share-link token generation       | Not verified                  | —       | `crypto.randomBytes(32).toString('base64url')` |
| Better Auth addMember API | accept-share-link.ts              | In use via better-auth-org.ts | 1.4+    | None — core dependency                         |

---

## Validation Architecture

### Test Framework

| Property           | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| Framework          | bun:test (backend unit + integration)                     |
| Config file        | `bunfig.toml` (coverageThreshold=0.80, smaxConcurrency=4) |
| Quick run command  | `bun test packages/budgeting/test/domain/cadence.test.ts` |
| Full suite command | `make test`                                               |

### Phase Requirements → Test Map

| Req ID  | Behavior                                                         | Test Type   | Automated Command                                                   | File Exists?   |
| ------- | ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- | -------------- |
| TXN-01  | expense_ledger schema has new columns                            | schema      | `bun test apps/api/test/schema/v11-shape.test.ts`                   | ✅ (extend)    |
| TXN-03  | POST /budgets/[id]/transactions sets confirmed_at=now()          | integration | `bun test apps/api/test/routes/transactions.test.ts`                | ✅ (rewrite)   |
| TXN-04  | PATCH with currency_original triggers FX re-compute              | integration | `bun test apps/api/test/routes/transactions.test.ts`                | ✅ (extend)    |
| TXN-06  | PATCH response includes original+converted+rate+as_of            | integration | `bun test apps/api/test/routes/transactions.test.ts`                | ✅ (extend)    |
| TXN-07  | No TRANSFER kind accepted; INCOME stores positive amount         | unit        | `bun test packages/budgeting/test/transaction-domain.test.ts`       | ✅ (extend)    |
| RECR-01 | DAILY nextOccurrence returns +1 day                              | unit        | `bun test packages/budgeting/test/domain/cadence.test.ts`           | ✅ (extend)    |
| RECR-01 | YEARLY nextOccurrence respects yearlyMonth + anchorDay           | unit        | `bun test packages/budgeting/test/domain/cadence.test.ts`           | ✅ (extend)    |
| RECR-02 | Weekly rule due today → exactly one draft in expense_ledger      | integration | `bun test packages/budgeting/test/recurring-engine-catchup.test.ts` | ❌ Wave 0      |
| RECR-02 | Catch-up: 3 missed weekly dates → 3 drafts, idempotent on re-run | integration | `bun test packages/budgeting/test/recurring-engine-catchup.test.ts` | ❌ Wave 0      |
| RSCM-01 | category_reserve_balance view returns 0 for new category         | integration | `bun test packages/budgeting/test/reserve-balance-repo.test.ts`     | ❌ Wave 0      |
| RSCM-01 | Multi-month accumulation computes correctly                      | integration | `bun test packages/budgeting/test/reserve-balance-repo.test.ts`     | ❌ Wave 0      |
| RSCM-02 | Cushion mode flip mid-history uses correct budget per month      | integration | `bun test packages/budgeting/test/reserve-balance-repo.test.ts`     | ❌ Wave 0      |
| SHRD-01 | POST /budgets/[id]/share returns token URL with expiresAt        | integration | `bun test apps/api/test/routes/share-links.test.ts`                 | ❌ Wave 0      |
| SHRD-03 | Expired token → isExpired=true on GET join                       | integration | `bun test apps/api/test/routes/share-links.test.ts`                 | ❌ Wave 0      |
| SHRD-03 | Second accept attempt → 409 (already used)                       | integration | `bun test apps/api/test/routes/share-links.test.ts`                 | ❌ Wave 0      |
| SHRD-05 | DELETE /budgets/share/[id] sets revoked_at                       | integration | `bun test apps/api/test/routes/share-links.test.ts`                 | ❌ Wave 0      |
| ENGR-02 | No drizzle/Hono imports in domain layer                          | build       | `npx depcruise packages/budgeting/src/domain`                       | ✅ CI enforced |
| ENGR-04 | budget_share_links cross-tenant probe green                      | security    | `make ci-gate`                                                      | ✅ (extend)    |

### Sampling Rate

- **Per task commit:** `bun test [specific test file for task]`
- **Per wave merge:** `make test`
- **Phase gate:** `make test && make ci-gate` before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/budgeting/test/recurring-engine-catchup.test.ts` — covers RECR-02 (catch-up loop, idempotency)
- [ ] `packages/budgeting/test/reserve-balance-repo.test.ts` — covers RSCM-01, RSCM-02 (5 scenarios per D-PH2-11)
- [ ] `apps/api/test/routes/share-links.test.ts` — covers SHRD-01, SHRD-03, SHRD-05 + 4 security paths per D-PH2-10

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                              | Standard Control                                                               |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| V2 Authentication     | yes (share-link accept)              | Better Auth session on POST accept; GET resolve is unauthenticated by design   |
| V3 Session Management | no                                   | No session changes in this phase                                               |
| V4 Access Control     | yes (owner-only share create/revoke) | Better Auth org role check; budget_share_links RLS tenant_id policy            |
| V5 Input Validation   | yes                                  | Zod schemas on all new route inputs (ttlDays, token format)                    |
| V6 Cryptography       | yes (token generation)               | nanoid(32) or `crypto.randomBytes(32).toString('base64url')` — never hand-roll |

### Known Threat Patterns

| Pattern                                                                    | STRIDE                 | Standard Mitigation                                                                                         |
| -------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Cross-tenant share-link probe (use tenant-A token to read tenant-B budget) | Information Disclosure | budget_share_links.budget_id FK scope; withInfraTx reads only matching token row; CI gate cross-tenant test |
| Expired/revoked token still accepted                                       | Elevation of Privilege | WHERE revoked_at IS NULL AND accepted_by IS NULL AND expires_at > NOW() on accept path                      |
| Non-owner creating/revoking share links                                    | Elevation of Privilege | Better Auth org role check (role='owner') before INSERT/UPDATE                                              |
| Token brute-force (32-char nanoid = ~192 bits entropy)                     | Spoofing               | nanoid(32) provides ~192-bit entropy; no rate limiting needed at v1.1 scale but worth noting                |
| SQL injection via token param                                              | Tampering              | Parameterized SQL via Drizzle `sql\`...\`` template literals throughout                                     |

---

## Project Constraints (from CLAUDE.md)

- **TDD-first:** Write failing tests before implementation. `make test` before asking user to verify anything.
- **Hexagonal:** No drizzle-orm/Hono/AI SDK imports in `domain/`. New `ReserveBalanceRepo` port in `ports/`; adapter in `adapters/persistence/`. Enforced by `.dependency-cruiser.cjs`.
- **Drizzle types ONLY in `adapters/persistence/`:** Domain entities are plain classes. `Transaction` kind field is a TS literal type only.
- **Money at adapter boundary:** `amount_*_cents BIGINT + currency CHAR(3)` in DB; `ReserveBalanceRepo` returns `Money` instances.
- **Temporal API for dates:** All date math via `Temporal.PlainDate`. No `new Date()` for cadence math.
- **pg-boss for jobs:** No in-process cron. Recurring engine stays in `apps/worker/src/handlers/recurring-engine.ts`.
- **Hand-authored migrations:** `drizzle-kit generate` is TTY-only. Migration 0013 is hand-authored SQL, same as 0011 and 0012.
- **post-migration.sql lockstep:** Every new table/view in 0013 needs corresponding GRANT/FORCE RLS/policy in `post-migration.sql`. Container boot fails otherwise.
- **Integration tests use real Postgres:** No DB mocking. Use testcontainers pattern from `packages/budgeting/test/helpers.ts`.
- **80% domain coverage threshold:** `bunfig.toml` coverageThreshold=0.80. Coverage is scoped to `packages/*/src/domain/` only (adapters/application/contracts/ports excluded).

---

## Sources

### Primary (HIGH confidence — verified from codebase)

- `packages/budgeting/src/domain/cadence.ts` — current Cadence type (MONTHLY|WEEKLY only), nextOccurrence function
- `packages/budgeting/src/domain/transaction.ts` — current Transaction entity fields (kind, accountId, transferGroupId, correctsId)
- `packages/budgeting/src/domain/recurring-rule.ts` — current RecurringRule entity (walletId, kind)
- `packages/budgeting/src/adapters/persistence/transaction-repo.ts` — current SQL column names (amount_orig, amount_default, fx_rate_date, wallet_id)
- `packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts` — check constraint shows MONTHLY|WEEKLY; kind check shows EXPENSE|INCOME|TRANSFER
- `packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts` — separate drafts table with UNIQUE(rule_id, due_date)
- `packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts` — table exists (walletId FK), to be dropped
- `packages/budgeting/src/adapters/persistence/budget-mode-history-schema.ts` — SCD-2 with effectiveFrom/effectiveTo
- `packages/shared-kernel/src/ports/fx-provider.ts` — rateAsOf(from, to, date: Date) signature
- `apps/worker/src/handlers/recurring-engine.ts` — existing catch-up logic (single date only); INSERT into recurring_drafts
- `apps/api/src/routes/transactions.ts` — current route shape (POST/GET/correct/history/bulk-recategorize)
- `apps/api/src/routes/recurring-drafts.ts` — existing route to be deleted
- `apps/api/src/routes/recurring-rules.ts` — existing create/list/patch/delete with current cadence schema
- `apps/api/src/app.ts` — middleware ordering and route registration pattern
- `packages/tenancy/src/adapters/persistence/better-auth-org.ts` — createOrganizationPlugin with addMember hook
- `packages/tenancy/src/application/invite-member.ts` — existing email-based invite stub (keep dormant)
- `.dependency-cruiser.cjs` — 5 forbidden rules enforced
- `bunfig.toml` — coverageThreshold=0.80, smaxConcurrency=4, timeout=30000
- `drizzle/0012_phase01_v11_rename.sql` — confirms Phase 1 dropped kind/account_id/to_account_id/direction from expense_ledger; did NOT rename amount columns
- `apps/migrator/post-migration.sql` — REVOKE UPDATE/DELETE on expense_ledger; FORCE RLS pattern
- `.planning/phases/02-domain-api-restructure/02-CONTEXT.md` — all locked decisions D-PH2-01 through D-PH2-12

### Secondary (MEDIUM confidence — from CONTEXT.md rationale)

- CONTEXT.md code_context section — FxProvider reuse pattern, withInfraTx/withTenantTx split for public join
- CONTEXT.md specifics section — negative-number quick-entry for INCOME, reserve view freshness rationale

---

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — all libraries verified in codebase
- Architecture: HIGH — locked decisions in CONTEXT.md; code patterns verified
- Pitfalls: HIGH — directly derived from code inspection (column names, REVOKE in post-migration.sql)
- SQL VIEW shape: MEDIUM — skeleton from spec formula; exact CTE structure is Claude's Discretion

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (stable domain, 30 days)
