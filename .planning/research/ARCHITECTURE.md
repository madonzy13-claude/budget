# Architecture Research

**Domain:** Multi-tenant SaaS family budgeting & wealth tracker
**Researched:** 2026-05-05
**Confidence:** HIGH (architecture is well-trodden territory; specific stack choices already locked in PROJECT.md)

---

## Executive Recommendation

**Modular monolith** with strict bounded contexts as the module boundary, hexagonal layering inside each context, deployed as a single Bun process plus a separate worker process backed by a single Postgres database. RLS enforces tenancy at the data layer. Inter-context communication uses two channels: synchronous direct calls through published application service contracts, and asynchronous in-process integration events for fan-out (insights projections, task generation, notifications). No microservices in v1. Splittable later because the boundaries are real.

Rationale: small team, single product, finance domain that wants strong transactional consistency at the aggregate level, Bun runtime that loves a single process. Microservices would force network calls and distributed transactions across contexts that share the same families and money — wrong tradeoff for v1.

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser / PWA)                         │
│   Next.js App Router · React Server Components · Service Worker         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ HTTPS (REST/RPC, JSON)
┌──────────────────────────────────▼─────────────────────────────────────┐
│                        EDGE / API (Bun process)                         │
│   HTTP router · Auth middleware · Tenant guard · i18n · OpenAPI         │
│   Idempotency keys · Rate limit · Request logging                       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ in-process function calls
┌──────────────────────────────────▼─────────────────────────────────────┐
│                  APPLICATION CORE (Modular Monolith)                    │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Identity │ │ Tenancy  │ │Budgeting │ │ Reserve  │ │ Cushion  │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐      │
│  │Investmnts│ │  Tasks   │ │ Insights │ │Comparison│ │  Notify  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│  ┌──────────┐                                                           │
│  │Onboarding│        Each context = domain · application · ports        │
│  └──────────┘        Communication: contracts (sync) + event bus (async)│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  SHARED KERNEL (tiny, vetted)                                    │    │
│  │  Money(amount,currency) · Currency · TenantId · UserId · Clock   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────┬─────────────────────────────────────────┬────────────────┘
               │ ports                                   │ ports
┌──────────────▼──────────────┐         ┌────────────────▼────────────────┐
│   ADAPTERS (driven side)    │         │     ADAPTERS (driving side)     │
│   FX (Frankfurter)          │         │     HTTP handlers               │
│   STT (Browser/Groq)        │         │     CLI (admin, migrations)     │
│   LLM (Claude/Groq)         │         │     Worker job handlers         │
│   Prices (stocks/crypto/Au) │         │     Webhook receivers           │
│   Email (SMTP)              │         └─────────────────────────────────┘
│   Web Push                  │
│   Postgres repositories     │
│   Event bus impl            │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────────────┐
│                          PERSISTENCE                                     │
│  Postgres (single DB, RLS) · per-context schemas · ledger · audit       │
│  Redis (sessions, idempotency keys, rate-limit, ephemeral cache)        │
│  Object storage (later: exports, attachments)                           │
└─────────────────────────────────────────────────────────────────────────┘
                ▲
                │
┌───────────────┴─────────────────────────────────────────────────────────┐
│                       WORKER (Bun process)                               │
│   Same codebase, different entrypoint. Pulls jobs from a Postgres or    │
│   Redis queue. Runs: end-of-month sweep, projections rebuild, FX        │
│   refresh, price refresh, email/push delivery, comparison aggregation.  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Edge/API | HTTP, auth, tenant guard, i18n header, idempotency | Bun + Hono (or Elysia); thin |
| Identity | Users, sessions, MFA-ready, email verification | Lucia/BetterAuth tables + own aggregates |
| Tenancy | Families, members, roles, invites; the tenant boundary itself | Owns `families`, `family_members`; emits `MemberAdded` etc. |
| Budgeting | Categories, monthly limits (normal+cushion), expense ledger | Owns `categories`, `expense_ledger`, monthly closes |
| Reserve | Logical reserve balance per category; top-up/withdraw moves | Subscribes to Budgeting events; own ledger |
| Cushion | Target = N × cushion budget; holdings; drift detection | Reads cushion budgets via published view; own holdings table |
| Investments | Positions, valuations (manual + API), growth | Own `positions`, `valuations`; price adapter |
| Tasks | System action queue across contexts; dedupe; lifecycle | Subscribes to events from all other contexts |
| Insights | Read models / projections for charts | Pure read models; rebuildable from ledger |
| Comparison | Anonymized aggregates; opt-in; percentile bands | Worker-only writes; read API; PII stripped at boundary |
| Notifications | Email + web-push delivery, user preferences | Subscribes to events; adapter to SMTP / push |
| Onboarding | Q&A wizard, LLM-assisted seeding | LLM as adapter; emits `CategoriesSeeded` to Budgeting |
| Shared Kernel | Money, Currency, TenantId, UserId, Clock, Result | Tiny, no business logic |
| Worker | Scheduled + queued jobs | Same codebase, separate entrypoint |

---

## Recommended Project Structure

```
src/
├── api/                            # Driving adapter: HTTP
│   ├── server.ts                   # Bun HTTP entrypoint
│   ├── middleware/
│   │   ├── auth.ts                 # Resolves session → UserId
│   │   ├── tenant-guard.ts         # Resolves TenantId, sets RLS var
│   │   ├── i18n.ts                 # Resolves locale from header/user pref
│   │   └── idempotency.ts          # Honors Idempotency-Key header
│   └── routes/                     # Thin: parse → call app service → render
│       ├── budgeting.ts
│       ├── reserve.ts
│       └── ...
│
├── worker/                         # Driving adapter: jobs
│   ├── worker.ts                   # Entrypoint
│   ├── scheduler.ts                # cron-like
│   └── handlers/
│       ├── month-end-sweep.ts
│       ├── refresh-fx.ts
│       └── ...
│
├── contexts/                       # ← THE MAIN AREA. One folder per BC.
│   ├── budgeting/
│   │   ├── domain/                 # Pure. No I/O. No framework.
│   │   │   ├── category.ts         # Aggregate root
│   │   │   ├── expense.ts          # Aggregate root (or entity in Category)
│   │   │   ├── monthly-budget.ts   # Value object
│   │   │   ├── events.ts           # Domain events (typed)
│   │   │   └── policies/
│   │   ├── application/            # Use cases / app services
│   │   │   ├── add-expense.ts
│   │   │   ├── set-category-limit.ts
│   │   │   └── close-month.ts
│   │   ├── ports/                  # Interfaces (driven side)
│   │   │   ├── category-repo.ts
│   │   │   ├── expense-ledger.ts
│   │   │   └── fx-rates.ts
│   │   ├── adapters/               # Implementations of ports
│   │   │   ├── pg-category-repo.ts
│   │   │   ├── pg-expense-ledger.ts
│   │   │   └── frankfurter-fx.ts
│   │   ├── contracts/              # PUBLIC. Only thing other BCs may import.
│   │   │   ├── events.ts           # Integration events (subset of domain ones)
│   │   │   └── api.ts              # Synchronous published interface
│   │   └── module.ts               # Wires DI for this context
│   ├── reserve/
│   ├── cushion/
│   ├── investments/
│   ├── tasks/
│   ├── insights/
│   ├── comparison/
│   ├── notifications/
│   ├── onboarding/
│   ├── identity/
│   └── tenancy/
│
├── shared-kernel/                  # SMALL. Cross-cutting value objects only.
│   ├── money.ts                    # Money(amount, currency) value object
│   ├── currency.ts
│   ├── tenant-id.ts
│   ├── user-id.ts
│   ├── clock.ts                    # Injectable clock for tests
│   └── result.ts                   # Result<T,E> for ports
│
├── platform/                       # Cross-cutting infra. NOT domain.
│   ├── db/
│   │   ├── pool.ts                 # pg pool
│   │   ├── tx.ts                   # withTransaction(tenantId, fn)
│   │   ├── rls.ts                  # SET LOCAL helper
│   │   └── migrations/             # SQL files, per context schema
│   ├── events/
│   │   ├── bus.ts                  # In-process pub/sub
│   │   └── outbox.ts               # Transactional outbox table
│   ├── i18n/
│   │   ├── catalogs/               # JSON per locale
│   │   └── translate.ts
│   ├── logging.ts
│   ├── tracing.ts                  # OpenTelemetry
│   ├── feature-flags.ts
│   └── config.ts
│
└── tests/
    ├── domain/                     # Fast, no I/O
    ├── integration/                # With Postgres testcontainer
    └── e2e/                        # Through HTTP

apps/
└── web/                            # Next.js (App Router) - separate package
    └── ...
```

### Structure Rationale

- **`contexts/<name>/{domain,application,ports,adapters,contracts}`**: enforces hexagonal layering inside each BC. Domain depends on nothing. Application depends on domain + ports. Adapters depend on ports. Contracts are the only thing other contexts import — prevents "leaky" cross-context coupling.
- **`shared-kernel/` is intentionally tiny**: only true cross-cutting value objects. Money is shared because every BC handles it; no business rules live here.
- **`platform/`**: framework, DB, events, i18n. Separate from `contexts/` to make the rule "contexts don't import platform-specific infra except in their `adapters/`" enforceable via lint.
- **`api/` and `worker/` are both driving adapters**: same application services, two entrypoints. This is the hexagonal payoff.
- **Web app in `apps/web/`**: separate package keeps Next.js bundle out of backend dependency graph.

---

## Bounded Contexts (Validated & Refined)

The 11-context list in PROJECT.md is correct. Two notes:

1. **Identity vs Tenancy split is right.** Identity owns "who you are" (user, sessions, password, MFA). Tenancy owns "what you can access" (families, membership, roles). Don't merge them — they evolve at different rates and have different security requirements. Identity is replaceable (Lucia → BetterAuth → SAML someday); Tenancy is yours forever.

2. **Onboarding is rightly its own BC, not a feature of Budgeting.** Reason: it owns the LLM adapter, has its own ubiquitous language ("wizard", "questionnaire", "suggestion"), and finishes when seeding is accepted. After that, edits flow through Budgeting normally. Keep them separate.

### Boundary Decision Matrix

| From → To | Mode | Why |
|-----------|------|-----|
| Identity → Tenancy | sync (published API) | Tenancy needs UserId verified |
| Tenancy → all others | events | "MemberAdded", "FamilyCreated" — fan-out |
| Budgeting → Reserve | events | "ExpenseRecorded", "MonthClosed" |
| Budgeting → Insights | events | Projections rebuild from ledger |
| Reserve → Tasks | events | "ReserveTopUpSuggested" |
| Cushion → Tasks | events | "CushionBelowTarget" |
| Investments → Tasks | events | "ValuationStale" |
| Investments → Insights | events | Growth read model |
| Onboarding → Budgeting | sync (published API) | Wizard creates real categories |
| Tasks → Notifications | events | "TaskCreated" with priority=high |
| Comparison ← Budgeting | events (anonymized) | One-way, opt-in only |
| Comparison ← Cushion | events (anonymized) | One-way, opt-in only |
| any → Identity | sync (read-only) | Resolve UserId metadata |

**Rule:** any time a BC needs to *react* to something happening elsewhere, use events. Any time it needs an *answer right now* to do its job, use a published synchronous API. Never reach into another BC's tables.

### Anti-Corruption Layers

Three places where ACLs are mandatory:

1. **Comparison ← anywhere**: events crossing into Comparison MUST go through an anonymizer that strips `userId`, `familyId`, free-text notes, and replaces precise amounts with bucketed values. The ACL lives in `contexts/comparison/adapters/anonymizing-event-handler.ts`.
2. **Onboarding → Budgeting**: LLM output is untrusted. The ACL converts LLM JSON into validated `CategoryDraft` value objects (Zod schema + domain invariants) before calling `Budgeting.publishedApi.seedCategories()`.
3. **External price/FX adapters → Investments/Budgeting**: every external response goes through an ACL that maps provider DTOs to domain `Price` and `FxRate` value objects, with explicit handling of stale data, missing fields, and currency mismatches.

---

## Hexagonal Layering — Reserve Context End-to-End

Use case: *month closed → for each category, compute (limit − actual). If positive, suggest "move X to reserve". If negative and reserve has balance, suggest "move X from reserve".*

```
contexts/reserve/
├── domain/
│   ├── reserve-account.ts          # Aggregate root, tenant_id + family_id + category_id
│   │   class ReserveAccount {
│   │     // invariants:
│   │     //  - balance currency == family default currency
│   │     //  - balance never negative (we don't model overdraft)
│   │     //  - movements are immutable once posted
│   │     applyTopUp(amount: Money): ReserveMovement
│   │     applyWithdrawal(amount: Money): ReserveMovement | InsufficientFunds
│   │   }
│   ├── reserve-movement.ts         # Value object: { id, amount, kind, atDate, sourceTaskId? }
│   ├── policies/
│   │   └── month-end-suggestion.ts # Pure function:
│   │     // (categoryLimit, actualSpend, currentReserveBalance) → Suggestion
│   └── events.ts
│       // ReserveTopUpSuggested, ReserveWithdrawalSuggested,
│       // ReserveTopUpConfirmed, ReserveWithdrawalConfirmed
│
├── application/
│   ├── handle-month-closed.ts      # Subscribes to Budgeting.MonthClosed
│   │   // 1. For each category: fetch limit, actual, current reserve balance
│   │   // 2. Run policy
│   │   // 3. Emit ReserveTopUpSuggested / ReserveWithdrawalSuggested
│   ├── confirm-reserve-move.ts     # User pressed "I moved the money" on a Task
│   └── adjust-reserve-manually.ts  # User edits reserve directly
│
├── ports/
│   ├── reserve-repo.ts             # interface ReserveRepo
│   │   //   load(tenantId, familyId, categoryId): Promise<ReserveAccount>
│   │   //   save(acct: ReserveAccount): Promise<void>
│   ├── budgeting-query.ts          # interface BudgetingQuery
│   │   //   getCategoryLimitsAndActuals(tenantId, familyId, month)
│   └── event-publisher.ts
│
├── adapters/
│   ├── pg-reserve-repo.ts          # Postgres impl. Honors RLS via tenant session var.
│   ├── budgeting-query-via-published-api.ts   # Calls Budgeting.publishedApi
│   └── outbox-event-publisher.ts   # Inserts into outbox table in same tx
│
├── contracts/
│   ├── events.ts                   # Public events (subset; stable shape)
│   └── api.ts                      # publishedApi.getReserveBalance(...)
│
└── module.ts                       # buildReserveModule(deps) → { httpRoutes, eventHandlers, publishedApi }
```

**End-to-end trace** for "month closed → reserve suggestions":

```
1. Worker.cron fires "close-month" job at 00:05 on day 1
2. Budgeting.application.closeMonth(tenantId, familyId, month)
   → loads CategoryLedger via pg adapter (RLS = tenantId)
   → computes per-category actuals
   → appends MonthClosed entry to budgeting ledger
   → emits Budgeting.events.MonthClosed via outbox (same tx)
   → tx commits
3. Outbox dispatcher reads MonthClosed, hands to event bus
4. Reserve.application.handleMonthClosed receives event
   → opens new tx, sets RLS tenant var
   → for each category: load ReserveAccount via pg adapter
   → calls Budgeting.publishedApi.getCategoryLimitsAndActuals(month)
   → runs domain policy month-end-suggestion()
   → emits ReserveTopUpSuggested / ReserveWithdrawalSuggested via outbox
   → tx commits
5. Tasks.application.onReserveSuggestion creates Task aggregate
   → emits TaskCreated
6. Notifications.application.onTaskCreated checks user prefs
   → if push enabled and priority high: enqueue web-push job
   → if email enabled: enqueue email job
```

Note: domain has zero I/O. All I/O sits behind ports. Tests for the policy run in microseconds with no database.

---

## Data Flow — "Add expense in EUR, family default = USD"

```
[Browser]
  POST /api/expenses { amount: "12.50", currency: "EUR", categoryId, date, note }
  Headers: Authorization, Idempotency-Key, Accept-Language
       │
       ▼
[Edge / api/server.ts]
  ─ middleware/auth          → UserId
  ─ middleware/tenant-guard  → TenantId, FamilyId; SET LOCAL app.tenant_id
  ─ middleware/i18n          → locale = pl-PL
  ─ middleware/idempotency   → check Redis: seen this key? if yes, return cached resp
       │
       ▼
[api/routes/budgeting.ts → addExpense handler]
  parses + validates request body (Zod)
  calls Budgeting.application.addExpense({ tenantId, familyId, userId, dto })
       │
       ▼
[contexts/budgeting/application/add-expense.ts]   (use case orchestrator)
  ─ resolve category via CategoryRepo (RLS-scoped)  ── port → pg adapter
  ─ ask FxRates port for EUR→USD rate at expense date ── port → Frankfurter adapter
       (adapter caches to fx_rates table; ACL maps DTO → FxRate value object)
  ─ build domain Expense aggregate (pure, in-memory)
       Expense.create({
         id, tenantId, familyId, categoryId, userId,
         amountOriginal: Money("12.50", "EUR"),
         amountDefault:  Money(...converted..., "USD"),
         fxRate: FxRate(EUR, USD, 0.9234, 2026-05-04),
         date, note
       })
       (constructor enforces invariants → throws DomainError on violation)
  ─ open tx with tenant guard:
       BEGIN
       SET LOCAL app.tenant_id = '...'
       ExpenseLedger.append(expense)             ── INSERT into expense_ledger (immutable row)
       Outbox.publish(ExpenseRecorded event)     ── INSERT into outbox (same tx)
       COMMIT
  ─ return ExpenseDto (id, both Moneys, fxRate)
       │
       ▼
[Idempotency middleware caches response under key]
       │
       ▼
[Response 201 to client, with Money rendered per locale via i18n]

──── ASYNCHRONOUSLY, after commit ────

[Outbox dispatcher (worker)]
  reads new outbox row → publishes to in-process bus → marks dispatched

[Insights.handleExpenseRecorded]
  updates spending_by_category_month projection (UPSERT)
  updates spending_growth_daily projection

[Reserve.handleExpenseRecorded]
  no-op until month close (reserve only reacts to MonthClosed); but
  if running balance > limit → emits CategoryOverspent immediately

[Tasks.handleCategoryOverspent]
  creates Task "Category 'Groceries' is overspent by $12 — review"
  emits TaskCreated

[Notifications.handleTaskCreated]
  enqueues push/email per user prefs
```

Key properties:
- **Same-tx outbox**: domain change and event publication are atomic. No "we updated the ledger but forgot to emit the event."
- **FX rate is captured at write-time, stored on the row**. Re-running analytics never produces a different number — auditable.
- **Idempotency** via `Idempotency-Key` header → Redis with 24h TTL. Replays return the cached response, never duplicate the ledger row.
- **Domain is pure**. The aggregate constructor doesn't talk to the FX provider — the application service does, then hands a fully-formed `Money` pair to the aggregate.

---

## Multi-Tenancy Strategy — Concrete

### Connection / Transaction Pattern

Every request that touches the DB goes through `withTenantTx(tenantId, fn)`:

```ts
// platform/db/tx.ts
export async function withTenantTx<T>(
  tenantId: TenantId,
  fn: (tx: TxClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL — resets at COMMIT/ROLLBACK; safe with PgBouncer transaction mode.
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(new TxClient(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Why `SET LOCAL` (not `SET`)**: `SET LOCAL` is transaction-scoped, so when PgBouncer (or any pooler) returns the connection to the pool after COMMIT, the next checkout starts with a clean session. `SET` persists across the pool checkout boundary — that's a tenant-leak waiting to happen.

### RLS Policies

Every tenant-scoped table:

```sql
ALTER TABLE expense_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_ledger FORCE ROW LEVEL SECURITY;  -- applies even to table owner

CREATE POLICY tenant_isolation ON expense_ledger
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

**App role rules** (non-negotiable):
- App connects as a role that is **not SUPERUSER** and does **not have BYPASSRLS**.
- `row_security = on` set at the role level so it can't be silently disabled.
- A separate "migration" role used only by migrations may bypass RLS.
- A separate "anonymizer" role used only by the comparison worker has its own narrower policies.

### Aggregate IDs and tenant_id

**Decision: tenant_id is on every tenant-scoped table; aggregate roots carry `tenantId` as a field, but the aggregate ID itself is a UUID, not composite.**

Reasoning:
- Composite keys (tenant_id, id) cause a constant tax on every join, FK, and index. Not worth it.
- UUID v7 (time-ordered) gives global uniqueness; collisions across tenants can't happen by birthday-paradox math.
- Tenant boundary is enforced at the *row* level via RLS, not at the *key* level.
- Repositories take `TenantId` as a parameter and assert it matches the loaded aggregate. Belt-and-braces.

```ts
class CategoryRepo {
  async load(tenantId: TenantId, id: CategoryId): Promise<Category> {
    // RLS already filters; if the row exists in our session, it's ours.
    const row = await tx.query(`SELECT ... FROM categories WHERE id = $1`, [id]);
    if (!row) throw new NotFound();
    if (row.tenant_id !== tenantId.value) throw new Error('RLS leak — bug');
    return Category.fromRow(row);
  }
}
```

The `tenantId !== ...` check should never fire in production but catches misconfigured RLS in tests immediately.

---

## Append-Only Ledger + Audit History — Schema Sketch

### The Ledger (immutable, append-only)

```sql
-- One ledger per "money-moving" context. Same shape, different table.
CREATE TABLE expense_ledger (
  id              UUID PRIMARY KEY,                -- UUIDv7
  tenant_id       UUID NOT NULL,
  family_id       UUID NOT NULL,
  user_id         UUID NOT NULL,                   -- who recorded it
  scope           TEXT NOT NULL CHECK (scope IN ('personal','shared')),
  category_id     UUID NOT NULL,
  account_id      UUID NULL,                       -- optional: external account label
  occurred_on     DATE NOT NULL,                   -- the expense date (user-provided)
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Money in original currency (as user entered it)
  amount_orig     NUMERIC(20,4) NOT NULL CHECK (amount_orig >= 0),
  currency_orig   TEXT NOT NULL,                   -- ISO 4217

  -- Money in family default currency (for analytics)
  amount_default  NUMERIC(20,4) NOT NULL CHECK (amount_default >= 0),
  currency_default TEXT NOT NULL,
  fx_rate         NUMERIC(20,10) NOT NULL,         -- captured at record time
  fx_rate_date    DATE NOT NULL,                   -- ECB rate effective date
  fx_provider     TEXT NOT NULL,                   -- "frankfurter" etc.

  note            TEXT NULL,
  source          TEXT NOT NULL                    -- 'form' | 'voice' | 'import'
                  CHECK (source IN ('form','voice','import')),

  -- Correction linkage. NEVER UPDATE/DELETE; instead append a corrector.
  corrects_id     UUID NULL REFERENCES expense_ledger(id),
  corrected_by_id UUID NULL REFERENCES expense_ledger(id),
  voided          BOOLEAN NOT NULL DEFAULT false   -- tombstoned by a corrector
);

-- Trigger: forbid UPDATE/DELETE except by the migration role.
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON expense_ledger
  FOR EACH ROW EXECUTE FUNCTION raise_immutable();

-- Helpful indexes (tenant_id leads, RLS cooperates)
CREATE INDEX ON expense_ledger (tenant_id, family_id, occurred_on DESC);
CREATE INDEX ON expense_ledger (tenant_id, family_id, category_id, occurred_on);
CREATE UNIQUE INDEX ON expense_ledger (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;  -- if you persist it
```

**Corrections rule**: if a user edits an expense, you don't UPDATE — you INSERT a new row with `corrects_id = old.id`, then UPDATE the old row's `corrected_by_id`/`voided` flag through the migration role inside a stored procedure (the one place mutations are allowed). The original row's data is preserved.

A simpler alternative often used: keep `voided` and just append a corrector; never touch the original row at all. Pick one consistently.

### Read Models (projections, mutable, rebuildable)

```sql
-- Per-category, per-month spending. Updated by Insights handler on ExpenseRecorded.
CREATE TABLE proj_spending_by_category_month (
  tenant_id    UUID NOT NULL,
  family_id    UUID NOT NULL,
  category_id  UUID NOT NULL,
  scope        TEXT NOT NULL,
  month        DATE NOT NULL,                    -- first day of month
  total_default NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_default TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, family_id, scope, category_id, month)
);
```

**Property:** every projection can be deleted and rebuilt by replaying the ledger. This is the auditability win without full event sourcing — the ledger is the system of record; projections are caches.

### Audit History (entity edits, not money movements)

For non-ledger entities (categories, family settings, cushion targets, member roles), use a generic versioned audit table:

```sql
CREATE TABLE audit_history (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  entity_type  TEXT NOT NULL,                    -- 'category', 'family', 'cushion_config'
  entity_id    UUID NOT NULL,
  version      INTEGER NOT NULL,                 -- monotonic per (entity_type, entity_id)
  actor_id     UUID NOT NULL,                    -- user who made the change
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_kind  TEXT NOT NULL                     -- 'created'|'updated'|'deleted'
               CHECK (change_kind IN ('created','updated','deleted')),
  diff         JSONB NOT NULL,                   -- {field: {from, to}}
  snapshot     JSONB NOT NULL                    -- full state after change
);

CREATE INDEX ON audit_history (tenant_id, entity_type, entity_id, version DESC);
```

**"Who changed what when"** queries become a single index lookup. Each context's repository is responsible for writing an audit row in the same tx as the entity update.

### Outbox

```sql
CREATE TABLE event_outbox (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NULL,                        -- null for tenant-agnostic events
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type   TEXT NOT NULL,                    -- 'budgeting.ExpenseRecorded'
  payload      JSONB NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ NULL                  -- null until handler completes
);
CREATE INDEX ON event_outbox (dispatched_at) WHERE dispatched_at IS NULL;
```

Worker polls `WHERE dispatched_at IS NULL`, dispatches, marks complete. v1 in-process bus is fine; this same outbox can later feed Kafka/NATS without changing producers.

---

## Architectural Patterns

### Pattern 1: Transactional Outbox

**What:** Same DB transaction commits domain changes AND inserts events into an `event_outbox` table. A separate dispatcher reads the outbox and publishes to the in-process bus, marking rows dispatched.

**Why:** Eliminates "wrote the row but forgot to publish" and "published but DB rolled back." Critical for finance.

**Trade-off:** Adds latency (poll loop) and requires the dispatcher to be idempotent. Worth it.

### Pattern 2: Published Language (per BC)

**What:** Each context exposes a `contracts/` folder with two things only: `events.ts` (integration events) and `api.ts` (synchronous published interface). Other contexts may import from `contracts/`. They MAY NOT import from `domain/`, `application/`, or `adapters/`.

**Why:** Internal refactors stay internal. Crossing-context coupling is explicit and reviewable.

**Enforcement:** ESLint `no-restricted-imports` rule + a fitness function test that scans the AST.

### Pattern 3: Repository per Aggregate

**What:** One repository per aggregate root. Loads/saves the whole aggregate. No "partial update" methods. Repositories accept `TenantId` and assert it on load.

**Why:** Aggregate integrity is the whole point of DDD. Partial updates leak invariants into the persistence layer.

### Pattern 4: Adapter for Every External Edge

**What:** Every external call (FX, STT, LLM, prices, email, push, even Postgres) sits behind a port. Domain talks to ports. Tests use in-memory adapters.

**Why:** Already locked in PROJECT.md. Pays for itself on the first provider swap.

### Pattern 5: Result<T, E> for Expected Failures

**What:** Domain methods that can fail return `Result<T, DomainError>` instead of throwing. Throw only for programmer errors (invariant violations that shouldn't reach prod).

**Why:** Insufficient reserve, overspend, FX missing — these are expected business outcomes, not exceptions. Forces callers to handle them explicitly. Makes Tasks generation cleaner: a failed `withdraw` returns a `InsufficientFunds` value, which the application service maps to a Task.

### Pattern 6: Idempotency Keys at the Edge

**What:** Mutating endpoints accept `Idempotency-Key` header. API middleware caches `(tenantId, key) → response` in Redis with 24h TTL. Replays return the cached response.

**Why:** Required for the month-end sweep (which retries) and for the PWA offline → reconnect path.

### Pattern 7: Money Value Object Everywhere

**What:** `Money(amount, currency)`. Decimal arithmetic (`big.js` or native `decimal128`). Currency mismatches throw at construction. No bare numbers in domain or DTOs.

**Why:** Already locked. The single most important invariant in this app.

### Pattern 8: ACL at LLM/Comparison Boundaries

**What:** LLM responses parsed via Zod into `CategoryDraft` value objects. Comparison events transformed by anonymizer into `AnonymousObservation` records. Both are unidirectional adapters.

**Why:** LLM output is untrusted; comparison events must be PII-free by construction.

---

## Cross-Cutting Concerns

### i18n

- **Source of truth:** JSON catalogs at `platform/i18n/catalogs/{en,pl,uk}/{namespace}.json`. Namespaces by BC (`budgeting.json`, `tasks.json`).
- **Server-side rendering (Next.js)**: locale resolved per-request from URL prefix (`/pl/...`) or `Accept-Language`. Server Components import the resolved catalog. RSC means no client bundle bloat.
- **Server-emitted strings (notifications, system tasks)**: tasks store a *message key* + *params*, not a rendered string. Render at delivery time using the recipient's preferred locale. Never store rendered text in the DB — when the user changes language, history should re-render.
- **Money formatting**: `Intl.NumberFormat(locale, { style: 'currency', currency })`. Don't roll your own.
- **Adding a language**: drop a new catalog folder, register in `platform/i18n/index.ts`, no code changes elsewhere. This requires discipline — every new string must go through the catalog.

### Idempotency

- **Edge level**: `Idempotency-Key` header on POST/PATCH; Redis cache; 24h TTL.
- **Worker level**: every job carries a deterministic key (`month-end-sweep:familyId:2026-05`). Worker checks `jobs_processed` table before running. Outbox dispatcher uses `dispatched_at` flag — same idempotency.
- **End-of-month sweep is idempotent by construction**: re-running the same month produces the same suggestions because actuals from the immutable ledger are deterministic.

### Feature Flags

- **Library-free v1**: a `feature_flags` table keyed by `(scope, scope_id, flag)` where scope ∈ {`global`, `tenant`, `user`}. Loader caches per request. Used for: comparison opt-in, voice STT enabled, LLM provider selection (per user), reserve enabled (per family), cushion enabled (per family).
- **Don't reach for OpenFeature/LaunchDarkly until you need them.** A table + cache is enough for v1.

### Observability

- **Logging**: structured JSON via `pino`. Every log line carries `tenantId`, `userId`, `requestId`, `traceId`. Never log Money values without currency. Never log notes/free-text.
- **Tracing**: OpenTelemetry from day one. Spans wrap: HTTP request, application service call, repository load/save, external adapter call. Without this, "why is the month-end sweep slow" is unanswerable.
- **Metrics**: Prometheus-format. Key metrics: requests by route+status, ledger appends/sec, outbox lag, FX cache hit rate, LLM call count + latency, RLS policy violations (must be zero in prod).
- **Audit log read API**: every BC's audit table is queryable through the user-facing "history" view. This is also a compliance feature (GDPR access requests).

### Security

- **Tenant guard test fixture**: every integration test boots a 2-tenant scenario and asserts each operation only sees its own tenant. Without this, RLS regressions are silent.
- **Secrets**: 12-factor env vars. No secrets in the repo. `.env.example` for shape.
- **CSRF**: standard double-submit cookie for browser sessions. PWA uses same-origin so simpler than typical SPA.
- **Rate limiting**: at the edge, per (tenantId, userId, route). Redis token bucket.

---

## Build Order — Dependency-Driven

### Layer 0: Foundations (sequential, must come first)

1. **Platform**: db pool + tenant tx helper, RLS scaffolding, outbox, in-process event bus, i18n loader, structured logging, OpenTelemetry, feature flag table.
2. **Shared kernel**: `Money`, `Currency`, `TenantId`, `UserId`, `Clock`, `Result`. With tests.
3. **Identity**: signup, login, sessions, password reset, MFA-ready (off in v1). Lucia or BetterAuth.
4. **Tenancy**: families, members, roles, invites. Depends on Identity.

### Layer 1: Money Spine (sequential)

5. **Budgeting** (categories + expense ledger + monthly limits). The core money spine. Depends on Tenancy.
   - FX adapter (Frankfurter) is finished here because Budgeting consumes it first.

### Layer 2: Money Reactions (parallel after Budgeting)

6. **Reserve** — depends on Budgeting events.
7. **Investments** — independent of Reserve/Cushion; depends only on Tenancy + shared kernel + price adapters.
8. **Cushion** — depends on Budgeting (for cushion-budget read) and Investments (for some holdings).

### Layer 3: Cross-cutting (parallel after Layer 2)

9. **Tasks** — subscribes to events from Budgeting, Reserve, Cushion, Investments. Cannot be built before its sources because there's nothing to subscribe to.
10. **Insights** — projections from Budgeting + Investments. Build the read model schemas as Layer 1/2 contexts emit events; the projection handlers can be added incrementally.
11. **Notifications** — subscribes to Tasks. Email adapter + push adapter. Build skeleton early (helps test other contexts), implement delivery after Tasks.

### Layer 4: User-facing assists (parallel)

12. **Onboarding** — depends on Budgeting (seeds categories) and the LLM adapter.
13. **Comparison** — depends on Budgeting + Cushion + the anonymizer ACL. Most isolated; can run on a slower track.

### Parallelization Map

```
Phase A:  Platform + Shared Kernel + Identity + Tenancy        (sequential)
Phase B:  Budgeting (with FX adapter)                          (sequential, blocking)
Phase C:  Reserve  | Investments | Cushion                     (parallel)
Phase D:  Tasks    | Insights    | Notifications               (parallel after C)
Phase E:  Onboarding | Comparison                              (parallel)
Phase F:  PWA polish, exports, GDPR/CCPA tooling, deploy       (sequential)
```

**Critical observation**: Tasks and Notifications are tempting to build early because they're "infrastructure-feeling." Don't. They have nothing to subscribe to until Budgeting/Reserve/Cushion/Investments are emitting events. Build their skeletons (the table, the bus subscription wiring) early; defer real handlers until the producers exist.

---

## Where the LLM Lives

**Verdict:** LLM is an adapter inside the Onboarding context. It does not appear in any domain layer. Period.

```
contexts/onboarding/
├── domain/
│   ├── wizard-session.ts            # State machine: questions, answers, drafts
│   ├── category-draft.ts            # VALIDATED suggestion (Money + name + scope)
│   └── policies/
│       └── seed-from-answers.ts     # Pure: Answer[] → CategoryDraft[]  (no LLM!)
├── application/
│   ├── start-wizard.ts
│   ├── answer-question.ts           # May call LLM port for next-question generation
│   ├── generate-suggestions.ts      # Calls LLM port; runs result through ACL → CategoryDraft[]
│   └── accept-and-seed.ts           # Calls Budgeting.publishedApi.seedCategories(drafts)
├── ports/
│   ├── llm.ts                       # interface Llm { complete(prompt, schema): Promise<unknown> }
│   └── stt.ts                       # interface Stt { transcribe(audio, lang): Promise<string> }
├── adapters/
│   ├── claude-haiku-llm.ts          # Anthropic SDK
│   ├── groq-llm.ts                  # Groq SDK
│   ├── browser-stt.ts               # Trivial — runs in browser, server adapter just types it
│   ├── groq-stt.ts
│   └── llm-acl.ts                   # Zod schemas; maps LLM JSON → typed value objects
└── contracts/
    └── events.ts                    # CategoriesSeeded, WizardCompleted
```

### LLM Discipline

1. **Structured output only.** Every LLM call uses Anthropic's tool-use / Groq's JSON mode with a Zod schema. Free-form responses are rejected.
2. **ACL is mandatory.** Even with structured output, every field is re-validated against domain invariants (currency exists, amount ≥ 0, name not empty after trim, etc.).
3. **LLM is a hint generator, not an authority.** Output is always shown to the user as suggestions. User confirms, edits, or rejects. The wizard's domain state machine is what produces real category creates — never the LLM directly.
4. **Tasks generation does NOT use the LLM.** Tasks are generated by deterministic domain policies (e.g., "actual > limit + reserve coverage" → overspent task). PROJECT.md mentions "structured Task generation" as a future LLM-adjacent area — keep it out of v1. If added later, it goes through its own ACL adapter producing typed events.
5. **Per-user provider selection.** User picks Claude or Groq in settings. The adapter is selected by a factory keyed on the user's preference. Deterministic, no router magic.
6. **Cost guardrails.** Hard token limit per user per day (config). Counter in Redis.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–500 families | Single Bun process for API + single Bun worker. Single Postgres. Redis for sessions/idempotency. RLS handles isolation. This is v1. |
| 500–5k families | Horizontal scale API (stateless, fine). Add Postgres read replicas; route read-only routes (insights, comparison) to replicas. Increase worker concurrency. Move FX/price caches to Redis. |
| 5k–50k families | Partition the ledger tables by `(tenant_id, occurred_on)` range or by hashed tenant_id. Move outbox dispatcher to a dedicated process. Pre-aggregate comparison data into materialized views, refreshed nightly. Consider extracting Comparison and Notifications to separate services — both have different failure tolerances and runtime profiles. |
| 50k+ families | Now seriously consider extracting BCs to services. The boundaries are already there. Replace in-process event bus with Kafka/NATS (the outbox pattern keeps producers unchanged). Move read models to a separate analytical store. |

### What breaks first?

1. **Outbox dispatch lag** under bursty load (month-end). Fix: increase dispatcher batch size; add dedicated dispatcher process.
2. **Insights queries on large ledgers**. Fix: pre-aggregated projections (already in design) + indexes on `(tenant_id, family_id, occurred_on)`. If still slow, add read replica.
3. **LLM cost on onboarding**. Fix: per-user daily token limit + cache common Q&A flows.
4. **Email delivery** to large families on month-end. Fix: dedicated worker queue, exponential backoff, batching.

---

## Anti-Patterns

### Anti-Pattern 1: Big Ball of Postgres

**What people do:** One `transactions` table, one `users` table, FKs everywhere, joins across the whole DB to render any view.

**Why it's wrong:** Every cross-table join becomes a coupling point that survives forever. New developers can't reason about which "tenant_id" to trust. Refactors are terrifying.

**Do this instead:** Schema per BC (`budgeting.expense_ledger`, `reserve.movements`). Cross-BC queries go through the published API, not joins. Same DB, separate namespaces.

### Anti-Pattern 2: Domain Layer with ORM Decorators

**What people do:** Annotate domain classes with `@Entity`, `@Column`. Domain becomes ORM-shaped.

**Why it's wrong:** Domain is no longer pure. Tests now require an ORM context. ORM upgrades become domain migrations.

**Do this instead:** Domain is plain TypeScript classes/types. Repositories handle the mapping in the adapter layer. Use `pg` directly or Kysely (typed query builder, no decorators) — both are fine. Avoid TypeORM.

### Anti-Pattern 3: Forgot RLS in Tests

**What people do:** Tests run as superuser, never exercise RLS. Production silently leaks.

**Why it's wrong:** RLS regressions are silent — the wrong rows show up, not an error.

**Do this instead:** Every integration test runs as the app role. A multi-tenant fixture (Family A and Family B) is shared across the suite. Each test asserts only the expected family's rows are visible.

### Anti-Pattern 4: Embedding LLM in Domain Logic

**What people do:** "Smart" categorization that calls the LLM from inside the Expense aggregate.

**Why it's wrong:** Domain becomes non-deterministic, untestable, and dependent on a paid network call. Test suite can't run offline. Behavior changes with model versions.

**Do this instead:** LLM lives in adapters of one BC (Onboarding). Domain is deterministic. If categorization assistance is added, it's a separate ACL-fronted suggestion service that produces *suggestions*, not *decisions*.

### Anti-Pattern 5: Updating the Ledger

**What people do:** Edit an expense → UPDATE the ledger row. "It's just a date fix."

**Why it's wrong:** Audit trail is destroyed. Projections rebuilt from the ledger now disagree with anyone who saw the old number. Compliance broken.

**Do this instead:** Append a corrector row referencing the original. Original is marked `voided`/`corrected_by_id` via a stored procedure restricted to the migration role. UI can show the original-then-corrected timeline.

### Anti-Pattern 6: Sync Calls Across All Contexts

**What people do:** Budgeting calls Tasks directly to "create the overspent task." Tasks calls Notifications directly. The whole request stack chains 6 contexts.

**Why it's wrong:** One slow downstream BC takes the whole request down. Coupling sneaks in. Failure handling becomes try/catch hell.

**Do this instead:** Mutating use case commits its own state + outbox event. Downstream BCs subscribe. Latency is lower, isolation is better, retries are localized.

### Anti-Pattern 7: Tenant_id as an Optional Field

**What people do:** Some tables have tenant_id, some don't. RLS only on "important" tables.

**Why it's wrong:** "Unimportant" tables (e.g., user preferences, attachments) become the leak.

**Do this instead:** Every table touched by user data has tenant_id NOT NULL and an RLS policy. If a table is truly global (e.g., currency reference data, system feature flags), it's owned by the migration role and read-only for the app role.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Frankfurter (FX) | Pull on demand + cache to `fx_rates` table; daily refresh job | Free, no key. ECB rate effective date matters — store it. |
| Groq STT | HTTPS POST audio | Long timeouts (5–20s); enqueue to worker if > 3s. |
| Browser STT | Client-side; server only receives final text | Adapter is trivial — just a typed pass-through. |
| Claude Haiku | Anthropic SDK; tool-use for structured output | Per-user daily token cap. |
| Groq LLM | Groq SDK; JSON mode for structured output | Same cap. |
| Stock/crypto/gold prices | Adapter per asset class; configurable per-position | Cache aggressively (15-min TTL for crypto, daily for stocks/gold). |
| SMTP (email) | nodemailer or similar via Bun-compatible client | Use a transactional service (Postmark/Resend/SES). |
| Web Push | VAPID keys; standard Push API | Subscriptions stored per device. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| API ↔ Application Services | direct call | Both in-process. |
| Worker ↔ Application Services | direct call | Worker is a different entrypoint into the same code. |
| BC ↔ BC (sync, query) | published API only | Lint rule: no imports from another BC except `contracts/`. |
| BC ↔ BC (async, react) | events via in-process bus + outbox | Producer commits + outbox in same tx. |
| All ↔ Postgres | via ports → pg adapter | Single pool; tx helper sets RLS var. |
| Comparison ← any BC | events through anonymizer ACL | Strictly one-way. PII removed at boundary. |

---

## Sources

- [GitHub: kgrzybek/modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd) — canonical reference for modular monolith with DDD; folder layout and event handling patterns are widely copied.
- [GitHub: tomsebastiantom/DomainDrivenRESTAPIBoilerplate](https://github.com/tomsebastiantom/DomainDrivenRESTAPIBoilerplate) — TypeScript multi-tenant SaaS boilerplate with hexagonal architecture.
- [Crunchy Data: Row Level Security for Tenants in Postgres](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) — `SET LOCAL` vs `SET` with poolers; the pattern this doc adopts.
- [AWS: Multi-tenant data isolation with PostgreSQL Row Level Security](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) — production-grade RLS guidance, role permissions, BYPASSRLS warning.
- [Bytebase: Postgres Row Level Security How-to](https://www.bytebase.com/reference/postgres/how-to/postgres-row-level-security/) — `FORCE ROW LEVEL SECURITY`, role hardening.
- [Paul Gross: Double-Entry Ledgers — The Missing Primitive in Modern Software](https://www.pgrs.net/2025/06/17/double-entry-ledgers-missing-primitive-in-modern-software/) — append-only + corrections-not-edits principle.
- [pgledger: A double-entry ledger in PostgreSQL](https://github.com/pgr0ss/pgledger) — concrete Postgres ledger schema; functions+views pattern.
- [Oskar Dudycz: Building your own Ledger Database](https://www.architecture-weekly.com/p/building-your-own-ledger-database) — projections from immutable log; pragmatic alternative to full ES.
- [Reformed Programmer: Evolving modular monoliths — passing data between bounded contexts](https://www.thereformedprogrammer.net/evolving-modular-monoliths-3-passing-data-between-bounded-contexts/) — sync-vs-async cross-BC communication tradeoffs.
- [SoftwareSeni: Building Modular Monoliths with Logical Boundaries, Hexagonal Architecture and Internal Messaging](https://www.softwareseni.com/building-modular-monoliths-with-logical-boundaries-hexagonal-architecture-and-internal-messaging/) — hexagonal-per-module pattern.
- [Codecentric: Hexagonal Architecture — DDD Microservices & Monoliths](https://www.codecentric.de/en/knowledge-hub/blog/hexagon-schmexagon-2) — when hexagonal helps and when it's overkill.

---
*Architecture research for: multi-tenant SaaS family budgeting & wealth tracker*
*Researched: 2026-05-05*
