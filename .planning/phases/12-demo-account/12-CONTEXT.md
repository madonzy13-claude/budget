# Phase 12: Demo Account - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning
**Source:** Brainstorming session with the user (decisions locked interactively)

<domain>
## Phase Boundary

Ship one shared, credentialed demo login that a prospect can be handed to see the whole product working on realistic data — Overview, reserves, cushion, investments, tasks, multi-currency, the budget switcher and the all-budgets aggregate — without exposing the owner's real finances.

The demo tenant is refreshed nightly by copying two of the owner's real budgets through a scrubbing manifest. Everything in this phase exists to make that copy safe, repeatable, and self-disabling when the schema changes.

**In scope:** the nightly refresh job, the scrub manifest + preflight, the demo user and its guardrails, the `/demo` entry route, the first-paint demo dialog with a language picker, and the tenant-leak gate that proves isolation.

**Out of scope:** per-visitor sandboxes, a marketing site, analytics on demo usage, synthetic data generation, resetting on demand from the UI.

</domain>

<decisions>
## Implementation Decisions

### Demo access model (LOCKED)

- **One shared login**, not per-visitor ephemeral sandboxes and not read-only. Writes are allowed so a prospect can actually feel the app — add an expense, complete a task.
- Concurrent visitors can therefore step on each other. Accepted; the nightly wipe is the repair.
- The user considered and rejected: fresh sandbox per visitor (more machinery), read-only shared (cannot demo capture, which is the pitch).

### Seed source (LOCKED)

- The demo is a **copy of the owner's real budgets**, not synthetic data. Realism was judged worth more than the scrub burden.
- Two source budgets, both verified present in the live DB on 2026-08-29:
  - `Private Budget` `d30ee8ca-a44f-493b-af60-0f9cbd9199f8` — PLN, 1 member, investments ON, 798 txns / 19 categories / 38 wallets → **demo personal budget**. Carries the investments + reserve + cushion story.
  - `Family Budget` `a2372ac5-bcdd-4e70-a4ca-4ab26d1f3bf0` — PLN, 2 members, investments OFF, 539 txns / 10 categories / 17 wallets → **demo family budget**. Exists so the budget switcher and the Phase-11 all-budgets aggregate Overview have something real to render.
- Source ids are configuration (`DEMO_SOURCE_TENANT_IDS`), never literals in code.

### Refresh cadence (LOCKED, with a mandated mitigation)

- **Nightly re-pull from the live tenant**, not a frozen human-reviewed fixture. The user chose always-current over review-once.
- The risk was raised explicitly before the choice: an unattended nightly scrub means a column added later flows to a public login before anyone looks at it.
- **Mitigation, non-negotiable and part of the definition of done:** the scrub is a **column ALLOWLIST**. Preflight compares `information_schema.columns` against the manifest; an unmanifested column **aborts the run** and leaves yesterday's demo data in place. The failure mode is "demo refresh broke, go update the manifest," never "unreviewed field is public."

### Isolation (LOCKED — the user's explicit requirement)

- "Make sure that demo account will never be able to access my data."
- Guarantee is structural, not procedural: the demo user holds `tenancy.budget_members` rows for the demo budgets **only**. RLS derives `app.tenant_ids` from membership, so the demo session's GUC can never contain an owner tenant id.
- `app_role` is `NOBYPASSRLS`, already pinned by `tests/tenant-leak/pg-roles-no-bypassrls.test.ts`.
- Exactly one code path ever sees both tenants: the refresh job, inside one worker transaction, never in a request context.
- A new gate test pins this and runs in `make ci-gate`.

### Scrub rules (LOCKED)

- **Money:** every money column multiplied by ONE uniform factor **per budget pair, per night**. Uniform _within a budget for that run_ because scaling is linear and therefore commutes with FX conversion and with every sum — limits, reserve balances, category totals and converted display amounts all stay consistent. Per-row random factors were rejected for exactly this reason. Factors differ _between_ the two demo budgets and _between_ nights: each budget-run is internally consistent, and the all-budgets aggregate only sums per-budget converted totals, so no invariant spans them.
- **The factor is re-rolled daily in [0.1, 10]** (user requirement, 2026-08-29). Rationale: a fixed factor is a constant offset an observer could eventually divide out; a moving one leaves the demo's magnitudes carrying no information about the owner's real ones.
  - Sampled **log-uniformly**, not uniformly — plain uniform over [0.1, 10] puts ~90% of its mass above 1.0, so the demo would almost always inflate. Log-uniform gives shrink and grow equal odds. (Offered to the user; flat uniform available on request.)
  - Derived deterministically from `(day, pairLabel)` rather than `Math.random()`, so re-running the same night reproduces the same demo — the job stays idempotent and the tests stay deterministic.
  - **Known cost, raised with the user:** at the top of the range a PLN→USD budget shows ~$40,000 grocery months. Good for anonymity, weaker for a prospect judging plausibility. Accepted.
- **Currency, per pair** (revised by the user mid-planning, 2026-08-29):
  - demo **personal** (from `Private Budget`) → **USD**: PLN rows relabeled USD.
  - demo **family** (from `Family Budget`) → stays **PLN**: no relabel.
  - Each pair draws its own daily factor, so the two demo budgets do not move together.
  - EUR/GBP/CHF/UAH preserved in both. Verified source wallet spread: PLN 40, EUR 7, GBP 3, USD 2, UAH 2, CHF 1.
- Two demo budgets in **different base currencies** is deliberate: it makes the Phase-11 all-budgets aggregate demonstrate real FX conversion rather than summing like-for-like. Consequence: the aggregate depends on a live `fx_rates` row for PLN→USD — the daily `fx-daily-fetch` job supplies it in production, and tests must seed it (project memory: the FX cache otherwise reaches a live API).
- Demo user `display_currency` = USD, so the aggregate renders in dollars across a USD and a PLN budget.
- **Free text never passes through.** Category, wallet, budget and holding names, transaction descriptions and notes are replaced from a fixed pool keyed by category so rows still read plausibly.
- **Derived tables are recomputed, not copied scaled** where a reconciliation job already owns them — per-row rounding of a scaled aggregate would drift from the sum of its scaled rows and surface as a visible inconsistency. Historical series that cannot be recomputed (wealth snapshots) are copied scaled; a line chart has no cross-row sum invariant to violate.

### Guardrails (LOCKED)

- Demo user gets 403 on: change-password, change-email, delete-account, member invitation, share-link creation. Without the first three, one visitor locks every later visitor out of the shared login.
- Outbox dispatch and web-push skip demo-tenant rows — no demo action may email or notify a real address.
- Implementation is one middleware plus one condition in the dispatchers, not a role system.

### Demo dialog + language (LOCKED)

- On first paint for the demo user: a dialog stating this is a demo whose data resets nightly, offering EN / PL / UK.
- The choice is stored **per browser** (locale cookie + a localStorage seen-flag), **never on the shared user row** — otherwise the first visitor's language becomes everyone's. This is the one place where "it's a shared account" changes an otherwise obvious implementation.
- Selection sets the locale cookie and soft-navs to `/{locale}/…`.

### Claude's Discretion

- Exact uuid remapping strategy inside the copy transaction (CTE-based map; fresh uuids per run are fine since the wipe precedes the copy).
- Merchant/name pool contents.
- Dialog visual composition, within DESIGN.md.
- Whether the manifest lives as one module or one file per bounded context.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Isolation / RLS

- `tests/tenant-leak/USER-DATA-TABLES.txt` — authoritative enumeration of user-data tables with TENANT-SCOPED / USER-SCOPED / EXCLUDED scope. Parsed at runtime by the gate tests; the demo gate test must parse it the same way so tables added later are covered automatically.
- `tests/tenant-leak/force-rls-on-all-tables.test.ts` — the existing shape for "walk every table in that file and assert".
- `tests/tenant-leak/pg-roles-no-bypassrls.test.ts` — pins `NOBYPASSRLS`, which the isolation argument depends on.

### Cascade order for the wipe

- `packages/identity/src/adapters/persistence/better-auth.ts` — `purgeUserData(uid)`; its delete ordering already solves the FK constraints (notably `category_reserve_adjustments` before `categories`). Reuse the order; do not re-derive it.

### Worker / scheduling

- `apps/worker/src/worker.ts` — pg-boss `boss.schedule(...)` registrations; the new `demo-refresh` cron joins these.
- `apps/worker/src/handlers/` — handler shape to match.

### Suppression points

- `packages/platform/src/outbox/dispatcher.ts` — `dispatchOutboxBatch()`.
- `packages/platform/src/push/push-repo.ts` — push send path.

### API middleware

- `apps/api/src/app.ts` — middleware registration order (`tracing` → `error` → `auth` → `tenantGuard` → `i18n` → route guards). `demoGuard` registers after `authMiddleware`.
- `apps/api/src/middleware/tenant-guard.ts` — closest analog for a session-inspecting middleware.

### Web

- `apps/web/src/components/settings/locale-select.tsx` — existing locale-switch mechanism to reuse in the dialog.
- `apps/web/src/middleware.ts`, `apps/web/src/lib/negotiate-locale.ts` — locale cookie + routing.
- `apps/web/messages/{en,pl,uk}.json` — all new strings land in all three.
- `DESIGN.md` — dialog and banner styling authority.

</canonical_refs>

<specifics>
## Specific Ideas

- Verified live on 2026-08-29 (do not re-derive): `tenancy.budgets` has `default_currency`, not `currency`; `budgeting.expense_ledger` has no `currency` column (currency lives on wallets).
- The 19-table cascade list recorded in project memory from 2026-06-26 is **stale** — the schema has since grown `incomes`, `scheduled_payments`, `budget_wealth_snapshots`, `spending_projection`, `expense_ledger_draft`, `onboarding_progress`. The manifest must be derived from the live DB, never hand-copied from that note. This staleness is itself the argument for the preflight.
- Docker images run from prebuilt artifacts; a worker code change needs a rebuild AND force-recreate to take effect (project memory: stale-worker incident).

</specifics>

<deferred>
## Deferred Ideas

- Per-visitor demo sandboxes with TTL cleanup — reconsider only if concurrent-prospect collisions actually bite.
- A holdings allowlist in the manifest — the user was asked whether the _mix_ of holdings is itself sensitive (scaling hides magnitude, not proportions) and did not request one. Add if that changes.
- On-demand "reset demo now" control.
- Demo usage analytics.

</deferred>

---

_Phase: 12-demo-account_
_Context gathered: 2026-08-29 via brainstorming session_
