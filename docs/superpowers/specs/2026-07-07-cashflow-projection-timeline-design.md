# Cash-Flow Projection Timeline — Design

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Surface:** Budget Detail Page → Overview tab, new full-width banner below the 5 hero/cards.

## Goal

Show the user, **in advance**, when they will start having money problems and with what.
Simulate "living from today until the end of next month": walk each day forward,
draining wallets by planned + recurring spending, refilling on income, and dipping
into reserves when a category overspends — then color each day by how healthy that
day is. The user scrubs the band to see, for any future day, how much is available,
which categories are shrinking their reserves, and which categories they can no
longer cover.

## Window

- Start: **today** (user timezone, `Temporal.Now.plainDateISO()`).
- End: **last day of next month**.
- Length therefore ranges from ~1 month + 1 day (when today is the last day of the
  current month) to ~2 months (when today is the 1st). Not scrollable — the whole
  window is always visible.

## Color model — two lenses, worst-of, per day

Each day gets exactly one color = the **worse** of two independent lenses.

**Liquidity lens** (timing of cash vs income):

- `cash ≥ 0` → green
- `cash < 0` but `cash + reservePool ≥ 0` → yellow (only reserve money keeps you afloat)
- `cash + reservePool < 0` → red (cannot pay)

**Budget lens** (per-category plan discipline):

- all categories within plan → green
- a category exceeded its plan this month, absorbed by that category's reserve `R[c]` → yellow (reserve shrinks)
- a category exceeded plan **beyond** its reserve `R[c]` → red (uncovered)

The band is a **daily heat band**: one cell per day, so a rough patch can recover to
green once a paycheck lands (liquidity lens is non-monotonic within a month; budget
lens resets at each month boundary). This was chosen over a monotonic
green→yellow→red segmented bar because real cash dips and recovers, and hiding the
recovery would misrepresent the forecast.

`reservePool` is a **single buffer** = Σ per-category reserve `R[c]` taken from the
reserve engine's open-month `endReserveCents`. It is tracked per-category for
attribution but consumed once — its funding is the RESERVE wallets, so RESERVE wallet
balances are **not** added again on top (no double count).

## The simulation

One forward pass, day by day, all money FX-converted to the budget's default currency
via `sumWalletsToCurrency`.

### Initial state

- `cash` = Σ balances of `SPENDINGS` wallets (+ `CUSHION` wallets iff `cushion_mode_enabled`), now.
- `R[c]` = per-category available reserve from the reserve engine (open-month `endReserveCents`); `reservePool = Σ R[c]`.
- `budget[c]` = category active budget for the relevant month (`cushion_mode_enabled ? cushionAmount : normalAmount`, from SCD-2 `categoryLimits`).
- `spentSoFar[c]` = confirmed `SPENDING` ledger for the **current** month only (`amount_converted_cents`, `confirmed_at IS NOT NULL`, `deleted_at IS NULL`, in-month by `transaction_date`). Next month starts at 0.

### Events placed on dates

- **Income** — for each active income, enumerate pay-dates in the window from its
  cadence. MONTHLY/YEARLY pay-day = `min(cadenceAnchor ?? daysInMonth, daysInMonth)`
  (YEARLY only in its `yearlyMonth`); DAILY/WEEKLY enumerated via `nextOccurrence`.
  A pay-date that already **passed earlier this month is skipped** — that money is
  already in the wallet balance (mirrors the existing income-under-planned rule).
  Each occurrence adds to `cash` on its date.
- **Recurring bills** — for each active recurring rule, iterate `nextOccurrence(spec, prev)`
  from the `nextDueDate` seed, collecting occurrences in `(today, end]`, attributed to
  the rule's `categoryId` (nullable → uncategorised bucket). Backstop at
  `MAX_PROJECTION_STEPS = 400` like `compute-upcoming-by-category`.
- **Discretionary burn** — the part of a category's plan not covered by dated bills,
  spread **evenly** across the remaining days as a per-day slice, drawn hatched
  ("assumed"):
  - current month: `max(activeBudget[c] − spentSoFar[c] − remainingBillsThisMonth[c], 0) / daysRemainingThisMonth`
  - next month: `max(activeBudget_next[c] − billsNextMonth[c], 0) / daysInNextMonth`

### Per-day step (date `d`)

1. **Month boundary** (d is the 1st of a new month): accrue prior month's leftover into
   reserve — `R[c] += max(budget_prev[c] − spentSoFar[c], 0)` — then reset
   `spentSoFar[c] = 0`, reload next-month effective `budget[c]`, recompute the
   discretionary daily burn.
2. **Income** due `d` → `cash += amount`.
3. **Outflows** due `d` (dated bills + each active category's daily burn), per outflow (category `c`, amount `a`):
   - `cash -= a`; `spentSoFar[c] += a`
   - `over = max(spentSoFar[c] − budget[c], 0)`; `newlyOver = over − prevOver[c]`
   - `draw = min(newlyOver, R[c])`; `R[c] -= draw`; `reservePool -= draw` (→ reserve shrink for `c`)
   - `catShort = max(newlyOver − draw, 0)` (→ uncovered for `c`)
4. **Color(d)** = worst of the liquidity lens and the budget lens (definitions above).
5. Record `DayCell { date, cashCents, color, drewReserve: {categoryId, amountCents}[], shortfall: {categoryId, amountCents}[], events: Point[] }`.

## Output shape (endpoint)

`GET /budgets/:id/overview/projection` (bigint → string at the boundary):

```
{
  currency: string,
  days: Array<{
    date: string,              // YYYY-MM-DD
    color: "green" | "yellow" | "red",
    available_cents: string,   // cash end-of-day
    drew_reserve: Array<{ category_id, name, amount_cents }>,
    shortfall:    Array<{ category_id, name, amount_cents }>,
  }>,
  income_points: Array<{ date, name, amount_cents }>,
  bill_points:   Array<{ date, name, category_id, amount_cents }>,
  summary: {
    first_yellow_date: string | null,
    first_red_date:    string | null,
    worst_shortfall_cents: string,   // 0 if never red
  }
}
```

## UI

- **Component:** `apps/web/src/components/budgeting/overview/projection-timeline.tsx` (client island),
  data via `apps/web/src/hooks/use-projection.ts` (React Query, own key `["budget", id, "projection"]`).
- **Placement:** sibling in `overview-tab.tsx`, after the 4-card grid, before `OverviewSections`.
  Full width, `CARD` style (`bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] rounded-[var(--radius-xl)] p-4`).
- **Band:** one cell per day; green `--trading-up`, red `--trading-down`, yellow `--primary`
  (or a dedicated warn token). Discretionary-driven days rendered hatched, dated recurring
  solid. Income markers ▲ below the band, bill markers ● on the band.
- **Headline:** danger-date summary — "On track through Aug 6" (green) / "Tightest around
  Aug 6 · short $120" (yellow/red), from `summary`.
- **Scrubber:** vertical cursor follows pointer-x (desktop hover) and touch-x (mobile drag,
  not scroll). Tooltip for that day: date, **available**, **reserve shrinking** (categories +
  amounts), **can't cover** (categories + amounts), any **income/bill** on that day. Reuses
  the existing chart-tooltip touch-dismiss pattern.
- **Money/date:** `centsToDisplayCompact`, `formatShortDate`. i18n namespace
  `bdp.tab.overview.projection`, strings in EN/PL/UK.

## Edge cases

- No income, no recurring, no discretionary → flat green band + "Add income or recurring
  rules to forecast" hint. (No outflows ⇒ never yellow/red.)
- FX failure on a leg → that leg falls back to raw cents, as `sumWalletsToCurrency` already does.
- Malformed cadence → bounded by `MAX_PROJECTION_STEPS = 400`.
- Reserves feature disabled → budget lens degrades to "green until over plan, then red"
  (no reserve buffer); liquidity lens unaffected.
- Category with active budget = 0 → means NO plan is set (the loader's
  `COALESCE(limit, 0)` on an unset limit row), not a "spend exactly zero" plan. The
  budget lens does not judge such a category (you cannot overspend a plan that does not
  exist); its outflow still hits the cash pool, so the liquidity lens covers it.

## Testing (TDD, red → green)

- **Domain (`bun:test`, golden fixtures for the pure sim):** green-all; payday-recovery
  (yellow→green after income lands); reserve-shrink-yellow; hard-red-shortfall;
  month-boundary accrual (unspent → reserve rescues next month); cushion-mode on vs off
  changes both `cash` and `budget[c]`; empty (no income/recurring) → flat green.
- **Route (`bun:test`):** `GET /overview/projection` returns the shape, bigint→string,
  RLS-scoped.
- **Component (Vitest + RTL):** scrubber moves cursor and renders the right day's tooltip;
  hatched vs solid.
- **E2E (`@overview`, Playwright BDD):** band renders on the seeded budget; tooltip appears
  on hover/drag; danger-date headline present.

## Improvements folded in

Danger-date headline; hatched "assumed" vs solid "known"; tap-a-point event detail;
empty-state hint; full FX to budget currency.

## Deferred (not in this build)

"What-if" sliders (adjust a category, see the band move); multiple scenarios; firing a
notification off the computed danger-date; caching the projection (compute-on-read first,
measure before optimizing).
