# All-Budgets Aggregate Overview — Design

**Date:** 2026-07-17
**Status:** Approved (design), pre-implementation
**Scope:** Replace the multi-budget listing view with a household-level aggregate
dashboard, in the user's global display currency, with per-member ownership
shares and a per-member "include in aggregation" flag.

---

## 1. Goal & primary job

Today the home "list all budgets" view (`?list=1`) renders a grid of budget
cards. Replace it, for users with **≥2 budgets**, with an **aggregate overview**:
combined net worth across all included budgets, converted to the user's global
`display_currency`.

Primary job (user's words): **"total wealth at a glance"**, with the ability to
**exclude any budget** from the aggregation, and — for shared budgets — to count
only **the member's own ownership share** of a budget's wealth (so two members of
one shared budget don't each count 100% of it).

Users with **1 budget** keep today's behavior (auto-open that budget's overview);
the aggregate is meaningless for a single budget.

---

## 2. Data model (one migration)

Two new columns on `tenancy.budget_members` (currently has no per-member settings
columns — these are the first). Migration lives in `drizzle/` as raw SQL with
`ADD COLUMN IF NOT EXISTS`, **registered in `drizzle/meta/_journal.json`** (an
unregistered migration is skipped by the migrator → CI fresh-DB 500s).

| Column                   | Type                | Default | Meaning                                                                                         |
| ------------------------ | ------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `ownership_share_pct`    | `SMALLINT NOT NULL` | `0`     | This member's % ownership of the budget's wealth. Σ across a budget's members = 100. Integer %. |
| `include_in_aggregation` | `BOOLEAN NOT NULL`  | `true`  | Whether this budget counts toward THIS member's aggregate. Per-member personal preference.      |

**Backfill (in the same migration):**

- `ownership_share_pct`: for every existing budget, set the `role='owner'` member
  to `100`, all other members to `0`.
- `include_in_aggregation`: default `true` covers all existing rows.

**Ownership-share invariant maintenance (mutation logic, not a DB constraint):**

- Budget create: owner member row written with `ownership_share_pct = 100`.
- Invite accepted → new member row inserted with `ownership_share_pct = 0`
  (column default; existing shares untouched, Σ stays 100).
- Member removed → their `ownership_share_pct` is folded into the owner's row
  (owner += removed share) inside the removal transaction, so Σ stays 100.
- Manual edit (owner, see §5) validates Σ === 100 before writing.

There is intentionally **no CHECK/trigger** enforcing Σ=100 at the DB layer;
enforcement is at the mutation boundary (a partial insert mid-transaction would
otherwise be impossible). Aggregation reads tolerate a transient Σ≠100 by using
each member's stored share verbatim (a drifted budget simply mis-weights until
re-balanced; it never errors).

---

## 3. Aggregate compute (backend)

### 3.1 Service

New budgeting application service `getAllBudgetsAggregate({ userId, budgetIds })`,
composed in `apps/api/src/boot.ts` alongside `homeSummaryService` (cross-context
orchestration at the composition layer — tenancy supplies budget ids, budgeting
computes financials).

Algorithm:

```
displayCcy = displayCurrencyReader.getDisplayCurrency(userId)   // fallback handled per-budget
for each budgetId in parallel:
    cards  = getOverviewCards(budgetId)          // amounts in budget.default_currency
    share  = memberShare(budgetId, userId)       // ownership_share_pct; 100 for a 1-member budget
    incl   = memberIncluded(budgetId, userId)    // include_in_aggregation
    rate   = fxProvider.rateAsOf(cards.default_currency, displayCcy, today)  // fiat→fiat
    → per-budget row (all *_cents in displayCcy, as strings):
        net_worth      = cards.capitalization    × rate × share/100
        investments    = cards.investment_value  × rate × share/100
        cash           = cards.available_to_spend × rate × share/100
        reserves       = cards.available_reserves × rate × share/100
        cushion        = cards.cushion.total      × rate × share/100
        spent_month    = cards.spendings.spent    × rate            (NOT × share)
        left_month     = cards.spendings.left     × rate            (NOT × share)
        overspent_total= cards.overspent.total    × rate            (NOT × share)
        overspent_count, cushion_breached, reserves_status, pending_tasks  (counts/flags, unscaled)
        my_share_pct, member_count, default_currency, name, id
        health         = "red" if overspent_count>0 || cushion_breached
                         "amber" else if reserves_status==="short"
                         "green" otherwise
        included, fx_unavailable
```

**Why reuse `getOverviewCards` (not the lighter `computeBudgetWealthNow`):** the
attention + this-month-flow blocks need `spent/left/overspent/cushion/reserves`,
which `getOverviewCards` already computes — so one existing service covers every
block. ponytail: getOverviewCards runs ~9 queries/budget; acceptable for a
household's N budgets (fan-out is parallel). If profiling shows it's slow, the
upgrade path is a purpose-built lighter aggregate compute — deferred, not built
now (YAGNI).

**Scaling rule (confirmed):** ownership share scales **wealth figures only**
(net worth, investments, cash, reserves, cushion). This-month spent/left and all
counts stay unscaled.

**FX:** `budget.default_currency → display_currency` is always fiat→fiat
(investments are pre-valued into the budget's fiat inside `getOverviewCards`),
so Frankfurter covers it. On `NoFxRateAvailable` for a budget, set
`fx_unavailable: true`, **exclude that budget from all totals**, and the UI shows
a per-budget "rate unavailable" notice — never silently zeroed.

**RLS:** budget ids from `workspaceRepo.listForUser(userId)` (user-scoped tx);
each `getOverviewCards` runs in its own tenant-scoped read. No RLS bypass.

### 3.2 Endpoints

- **`GET /budgets/aggregate`** → `{ display_currency, budgets: [ <per-budget row §3.1> ] }`.
  Cross-budget; mounted so it resolves before `/budgets/:id`. Returns per-budget
  rows already in display currency + the flags; the **client** filters
  `included` and sums (same-currency → plain addition → instant exclude toggle,
  no refetch). Totals are also returned as a convenience for the initial paint.
- **`GET /budgets/aggregate/wealth?range=&include=<ids>`** → combined net-worth
  trend. Sums each **included** budget's `get-overview-wealth` snapshot series
  per time bucket, converted at **today's** rate × share, forward-filling gaps so
  budgets with different snapshot cadences/start dates align on one axis.
  `include` is client-driven so the chart tracks the toggles. Returns
  `{ display_currency, series: [{ label, value_cents }], grow: {delta_cents, delta_pct} }`.
  **Deliberate simplification:** all history converted at today's FX rate —
  isolates real asset growth from currency-rate noise (a wealth trend, not an FX
  trend). Documented as intent, not an oversight.

---

## 4. Per-member "include in aggregation" flag

- Storage: `budget_members.include_in_aggregation` (§2).
- **Self-editable** endpoint `PUT /budgets/:id/aggregation` `{ included: boolean }`
  — writes ONLY the caller's member row (keyed `(budgetId, userId=caller)`). New
  repo method `setMemberAggregation(budgetId, userId, included)` (mirrors
  `setMemberRole` shape but self-scoped, not owner-gated). Membership is required
  (caller must be a member of the budget).
- Settings → General: a `Switch` section mirroring `reserves-section.tsx`
  (optimistic flip → PUT → rollback + toast on error → invalidate
  `["budget", budgetId, "detail"]` and `["budgets","aggregate"]`). **Rendered only
  when `useActiveBudgets().data.length >= 2`** (data-gated render precedent:
  settings-accordion config-progress). Default ON. **Not** wrapped in `OwnerGate`.
- The aggregate page's per-budget breakdown "exclude" toggle calls the **same**
  endpoint → single source of truth.

---

## 5. Ownership shares

- Storage: `budget_members.ownership_share_pct` (§2).
- **Owner-gated** endpoint `PUT /budgets/:id/members/shares`
  `{ shares: [{ userId, pct }] }` — validates every member is present and
  `Σ pct === 100` (else 422), then batch-updates all member rows in one tx. New
  repo method `setMemberShares(budgetId, shares)`. Owner gate mirrors
  `budget-identity.ts` PATCH (loads members, 403 if caller role ≠ owner).
- Settings → **Members** section: a whole-panel editor listing all members with a
  `%` input each + a live "total must be 100%" validator; save disabled unless
  Σ===100. Shown only for **shared budgets** (`memberCount > 1`); wrapped in
  `OwnerGate` (non-owners see it disabled/read-only). Integer % (manual entry;
  e.g. a 3-way split is 34/33/33).
  _(Deviation from "a per-member '…' item": a whole-panel Σ=100 editor is the only
  coherent way to keep the invariant — a single-member field can't. Confirmed.)_

---

## 6. UI — aggregate page

Replaces the `BudgetCardClient` grid inside the home `?list=1` view for ≥2-budget
users (`home-budgets-client.tsx`). New client component `AggregateOverview`,
wrapped in `SlotRevealProvider` (shared tap-to-reveal privacy). Reuses `CARD`,
`SlotAmount`, `useAnimatedNumber`, `OverviewPieChart`. DESIGN.md compliant:
single yellow accent (`--num-hero` for the hero total), BinancePlex on every
number, trading up/down as **text** color only, flat surfaces + hairlines, no
shadows/gradients, `max-w-[1280px]`.

Blocks, top → bottom:

1. **Hero — combined net worth** (`SlotAmount`, `useAnimatedNumber`), with a
   sub-split Investments / Cash / Reserves. All in `display_currency`.
2. **Per-budget breakdown** — one row per budget: converted net-worth
   contribution, % share of the aggregate total, health dot, a "my share N%"
   badge when `my_share_pct < 100`, an **include/exclude** toggle (writes §4
   flag), and a tap-through into that budget's overview. Excluding recomputes the
   hero/composition live (client re-sum). This is the replacement for the old
   card grid.
3. **Wealth composition** — `OverviewPieChart`: Cash vs Investments vs
   Reserves+Cushion across included budgets.
4. **Combined net-worth trend** — line chart from `GET /budgets/aggregate/wealth`
   (§3.2), range selector.
5. **Cross-budget attention** — Σ overspent (count + total), Σ cushion-breached,
   Σ reserves-short, Σ pending tasks; each row links into the relevant budget.
6. **This-month flow** — Σ spent vs Σ left this month (unscaled).

**Not aggregatable, intentionally omitted from sums:** per-budget runway
(`retirement_months`) and cushion months are ratios, never summed.

---

## 7. Edge cases

- Member with `ownership_share_pct = 0` → budget contributes 0 to their wealth;
  breakdown row shows "0%" badge (correct; they own none of it yet).
- Excluded budget (`include_in_aggregation = false`) → dropped from every total,
  the composition pie, and the trend.
- All budgets excluded → empty-state hero ("No budgets included — enable one in
  its settings").
- FX rate miss for a budget → `fx_unavailable`, excluded from totals with a
  per-row notice.
- Private / 1-member budget → share is 100, no ownership editor, no share badge.
- Backfilled existing shared budgets → owner 100, others 0 until the owner
  allocates (new feature, no prior expectation).

---

## 8. i18n

All new strings in `apps/web/messages/{en,pl,uk}.json`: the Settings → General
aggregation toggle, the Settings → Members ownership-share editor, and every
aggregate-page label (hero, block titles, badges, empty/notice states).

---

## 9. Testing (TDD — red → green → refactor)

- **Domain (bun:test):** share scaling math; Σ=100 validation (accept 34/33/33,
  reject 99, reject 101); churn (invite → 0, removal → owner-fold); FX-miss
  exclusion; health derivation.
- **API (bun:test, real Postgres):** `GET /budgets/aggregate` FX-converts +
  share-scales wealth (not flow), honors `include`, flags (not zeroes) FX-miss;
  `PUT /budgets/:id/aggregation` is self-editable + membership-guarded;
  `PUT /budgets/:id/members/shares` owner-gated + Σ=100 enforced; aggregate wealth
  trend forward-fills + today's-rate converts.
- **Component (Vitest + RTL):** hero re-sums on exclude toggle; share badge shows
  when <100; Settings aggregation section hidden with 1 budget, shown with ≥2;
  ownership editor save disabled unless Σ=100.
- **E2E (playwright-bdd, fresh user):** two budgets in different currencies + a
  shared budget with a 60/40 split → hero shows the correct display-currency
  total; toggle-exclude a budget → hero drops; the aggregation flag is hidden in
  Settings with a single budget.

---

## 10. Out of scope (this milestone)

- A purpose-built lighter aggregate compute (only if `getOverviewCards` fan-out
  profiles slow).
- Historical-accurate per-bucket FX for the trend (today's-rate is intentional).
- Sharing/allocation UX beyond integer % (no fractional shares, no auto-split).
