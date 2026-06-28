---
phase: 11
slug: budget-overview
status: approved
reviewed_at: 2026-06-28
shadcn_initialized: true
preset: project-local (existing app theme — DESIGN.md is the source of truth)
created: 2026-06-28
requirements_covered:
  - SC1
  - SC2
  - SC3
  - SC4
  - SC5
  - SC6
  - SC7
  - SC9
  - D-18
  - D-19
  - D-20
  - D-21
---

# Phase 11 — UI Design Contract: Budget Overview Tab

> The visual + interaction contract for the new `overview` BDP pill. **DESIGN.md is the source of truth**; this file resolves only the overview-specific decisions and the chart deviation. Frontend plans 11-02 (chart wrappers), 11-08 (tab shell + cards), 11-09 (sections + charts) MUST honor this contract; 11-10 localizes the copy below.

## Locked Design Decisions (this phase)

- **DD-1 Cards layout:** Capitalization is a **full-width hero card** (big BinancePlex figure) on top; the other four (available-to-spend, this-month overspent, cushion, available reserves) sit in a **2-col grid** below. (SC2)
- **DD-2 Range selector:** a **segmented pill row** (Month · 3M · Year · All · Custom), active pill yellow-underlined, matching the BDP tab pills; "Custom" opens a from→to date popover. (SC3)
- **DD-3 Chart palette = tokened, documented deviation from the single-yellow rule** (see Color). No new categorical palette is invented. (D-19)
- **DD-4 Sections collapsed by default**, full-width header + chevron, accordion toggle. (SC3, D-21)

---

## Design System

Reuse the existing app theme (Binance dark canvas). Tokens (DESIGN.md):

- Canvas near-black; cards `var(--surface-card-dark)`; hairlines `var(--hairline-dark)`; radius `var(--radius-xl)` (reuse the `placeholder-chart.tsx` frame).
- Single brand accent **yellow `#fcd535`** (`--accent` / primary), active `#f0b90b`.
- Fonts: **BinanceNova** (labels, headings), **BinancePlex** (numeric figures — all money + %). NOT Inter/IBM Plex.
- shadcn primitives already initialized (new-york / lucide) — reuse existing Card, Collapsible/Accordion, Tabs/SegmentedControl, Popover, Skeleton.

---

## Color

### Accent (yellow `#fcd535`) — overview inventory. No other element may be yellow except:

- Card hero value (capitalization figure) + each card's primary number.
- Active range pill underline + active wealth toggle.
- Chart **"real" / "value" series** (the value-claim moment): planned-vs-real `real` line, wealth value-series area, the primary bar fill where a single series.

### Chart palette — DOCUMENTED DEVIATION (DD-3)

Charts inherently need >1 color; this is an explicit, bounded deviation (precedent: Phase-9's P/L red exception). Allowed chart colors ONLY:

| Role                  | Color                                                                            | Used in                                                              |
| --------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| real / actual / value | yellow `#fcd535` (solid)                                                         | planned-vs-real `real`, wealth value series, primary bars            |
| planned / comparison  | neutral hairline `var(--hairline-dark)` / muted gray, **dashed** stroke          | planned-vs-real `planned`, planned-avg comparison                    |
| direction up          | trading green `#2ebd85`                                                          | grow/loss positive, MoM dynamics up bars, % deltas ≥ 0               |
| direction down        | trading red `#f6465d`                                                            | grow/loss negative, MoM dynamics down bars, % deltas < 0             |
| by-category bars      | **each category's own `colorKey`** (from the categories/reserves/spendings DTOs) | overspent-by-category, reserves-by-category, planned-avg-by-category |
| per-type pie          | **Phase-9 `UI_TYPE_COLOR`** (`lib/investment-icons.ts`)                          | wealth investments pie (D-18)                                        |

Axis ticks, grid lines, tooltips: `var(--hairline-dark)` / muted text on `var(--surface-card-dark)`. No chart uses a color outside this table.

### Trading semantics

Up = green `#2ebd85`, Down = red `#f6465d` — applies to grow/loss, monthly-avg-grow, and MoM dynamics. A neutral/zero delta renders muted (no green/red), and `null` % renders as `—`.

---

## Typography

- Card label: BinanceNova 14, muted. Card hero value: BinancePlex 32–40, white, tabular. Card secondary value: BinancePlex 16.
- Section header: BinanceNova 16/600. Chart axis: BinanceNova 12 muted. Stat figures: BinancePlex tabular-nums (no layout shift on revalidate).
- All money + % use tabular numerals.

---

## Layout

### Tab container

- The overview tab content scrolls vertically only; **no horizontal scroll at 375px** (SC1). Outer padding follows the existing BDP tab inset; section/cards use width-flexible grids (no fixed px).

### Cards (DD-1)

```
┌─────────────────────────────────────┐
│ CAPITALIZATION  (hero, net worth)   │   full-width, surface-card-dark
│  $42,180.00            ▲ (optional)  │   BinancePlex 40, yellow figure
│  incl. investments $12,400 (muted)   │   optional sub-line
└─────────────────────────────────────┘
┌──────────────────┐ ┌──────────────────┐
│ Available spend  │ │ Available reserves│   2-col grid, gap = --space token
│ $1,240.00        │ │ $3,500.00         │
└──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐
│ Overspent (mo)   │ │ Cushion           │
│ 2 categories     │ │ 3.0 mo · $9,000   │
│ Food · Transport │ │ (real months)     │
└──────────────────┘ └──────────────────┘
```

- Overspent card: count + a top-N category list (Discretion-resolved format). Zero overspend → "On budget" calm state, no red.
- Cushion card: real months to **1 decimal** + total amount; if cushion disabled, show a muted "Cushion off".
- All amounts in **budget default_currency** (D-11) — currency code shown subtly where it differs from the user's usual display.

### Range selector (DD-2)

- Segmented pill row directly under the cards, above the sections. Presets: `Month` (this month) · `3M` (last 3 months) · `Year` (this year) · `All` · `Custom`. Active pill = yellow underline + brighter text. `Custom` → Popover with two native `<input type="date">` (from / to), validated from ≤ to.
- The selector is sticky-light (stays visible as sections expand) OR inline at top — inline is acceptable; do not float over content.
- **Scope note rendered as helper text:** recurring charts + reserves bar are labeled "current config" / "all time" so users understand they ignore the range (D-14).

---

## Section Layout (DD-4)

Four collapsible sections, **all collapsed by default** (D-21), in this order: **Planned · Overspent · Reserves · Financial Wealth**. Each:

- Full-width header row: title (BinanceNova 16) + a right-aligned chevron; tap toggles. Collapsed shows only the header (cheap — the section's data hook is disabled until open, so no fetch until expanded).
- Expanded body uses the `placeholder-chart` card frame per chart, `minHeight 240px`.

### Planned (range-scoped except recurring)

- A **category selector** (default = "All categories" → budget-wide) — a compact dropdown of the budget's categories. Selecting one re-scopes the timeline.
- **Planned-vs-Real timeline**: Line chart. `real` solid yellow, `planned` dashed neutral. X = month (or day for short ranges, D-20). Legend names from i18n.
- **Planned-avg vs Real-avg**: horizontal Bar (Y = category), two grouped bars per category (real yellow, planned dashed/muted), averaged over active months (D-13).
- **Recurring per month**: Bar, X = month 1–12, labeled "current recurring config" (NOT range-scoped, D-14).
- **Recurring per category**: horizontal Bar (Y = category), bars use category `colorKey`.

### Overspent (range-scoped)

- A range **total overspent** figure (BinancePlex, red if > 0 else muted) + an **overspent-by-category** horizontal Bar (bars in each category's `colorKey`, descending, >0 only). Empty → "No overspending in this range" calm state.

### Reserves (NOT range-scoped)

- **Reserves-by-category** horizontal Bar (category `colorKey`), labeled "current". Empty → "No reserves yet".

### Financial Wealth (range-scoped value series)

- A **capitalization (default) / investments** toggle (segmented, yellow active).
- Stat row: **grow/loss** (amount in BinancePlex + % with up-green/down-red arrow), **monthly-avg grow %** (green/red). `null` → `—`.
- **Value time-series**: Area chart, yellow value line/fill, X = bucket (month/day, D-20), includes the live current point.
- **Month-over-month dynamics**: Bar of % per month, each bar green (up) / red (down).
- **Investments view only**: a **per-type Pie** (D-18) colored by Phase-9 `UI_TYPE_COLOR` (map `holding_type`→UI type). Empty wealth history → "Wealth history starts collecting now" (snapshots begin at go-live, D-04).

---

## Interaction Model

- **Pill nav:** overview is the first BDP pill; selecting uses the existing pushState carousel (zero RSC), slide animation by TAB_ORDER index (SC1).
- **Section expand/collapse:** tap header; chevron rotates; body animates open (reuse existing Collapsible). Lazy-fetch on first open.
- **Range change:** updates range-scoped charts only; each range is a distinct RQ key (cached; switching back is instant). Recurring + reserves bars do not refetch on range change.
- **Wealth toggle:** capitalization ↔ investments swaps the `?view` param (distinct RQ key); pie appears only in investments.
- **Pie reveal (D-18):** desktop **hover** shows tooltip (share % + type label) natively; mobile **tap** a slice sets the controlled `activeIndex` → the slice highlights (Sector `isActive` → yellow) and the tooltip shows share % + type label. Tap elsewhere / another slice updates it.
- **Loading:** persisted RQ paints cached data instantly, revalidates in background (D-03). First-ever load shows Skeletons (card-shaped + chart-shaped), never a blank/jumping layout.

---

## Empty States

| Surface                                 | Empty copy (EN)                                           |
| --------------------------------------- | --------------------------------------------------------- |
| Overspent (range)                       | "No overspending in this range."                          |
| Reserves bar                            | "No reserves yet."                                        |
| Wealth series (no snapshots)            | "Wealth history starts collecting now — check back soon." |
| Investments pie (no holdings)           | "No investments yet."                                     |
| Planned per-category (no data in range) | "No activity in this range."                              |

All empty states are calm (muted text, no red, no error styling).

---

## Copywriting Contract (i18n — EN canonical; PL/UK in 11-10)

`bdp.tab.overview.*`:

- `label` = "Overview", `title` = "Overview"
- `cards.availableToSpend` = "Available to spend", `cards.capitalization` = "Capitalization", `cards.capitalizationSub` = "incl. investments {amount}", `cards.overspent` = "Overspent this month", `cards.overspentCount` = "{count, plural, one {# category} other {# categories}}", `cards.onBudget` = "On budget", `cards.cushion` = "Cushion", `cards.cushionMonths` = "{months} mo", `cards.cushionOff` = "Cushion off", `cards.availableReserves` = "Available reserves"
- `range.month` = "Month", `range.3m` = "3M", `range.year` = "Year", `range.all` = "All", `range.custom` = "Custom", `range.from` = "From", `range.to` = "To", `range.currentConfig` = "current config", `range.allTime` = "all time"
- `sections.planned` = "Planned", `sections.overspent` = "Overspent", `sections.reserves` = "Reserves", `sections.wealth` = "Financial Wealth"
- `planned.category` = "Category", `planned.allCategories` = "All categories", `planned.real` = "Real", `planned.planned` = "Planned", `planned.recurringPerMonth` = "Recurring by month", `planned.recurringPerCategory` = "Recurring by category"
- `wealth.capitalization` = "Capitalization", `wealth.investments` = "Investments", `wealth.grow` = "Growth", `wealth.loss` = "Loss", `wealth.monthlyAvg` = "Monthly avg", `wealth.dynamics` = "Month-over-month", `wealth.pieShare` = "{pct}%"
- `empty.*` = the Empty States table above.

Numbers/percent formatting via the existing app money formatter + `next-intl` number format; no hand-rolled formatting.

---

## Accessibility

- recharts v3 `accessibilityLayer` (keyboard + SR) is on by default — keep it.
- Section headers are `<button>` with `aria-expanded`; chevron is decorative (`aria-hidden`).
- Range pills are a radiogroup / segmented control with `aria-pressed`/`aria-checked`; keyboard arrow nav.
- Pie tap target ≥ 44px; the active-slice info is also available as text (legend) so it is not hover/tap-only for SR users.
- Color is never the sole signal: up/down also carry an arrow glyph + sign; planned vs real differ by solid/dashed + legend, not just hue.
- Charts have an accessible name (`aria-label` / `<title>`) describing what they show.

---

## Mobile Layout

- 375px: cards hero full-width + 2-col grid (cards may wrap to 1-col if content overflows); range pills horizontally scrollable if they don't fit (no page h-scroll); charts `ResponsiveContainer width="100%"`.
- Touch targets ≥ 44px (DESIGN.md). Pie + bars remain legible; rotate long category labels or truncate with tooltip.
- No element forces document width > viewport (SC1 — E2E asserts `scrollWidth ≤ clientWidth`).

---

## Number Formatting

- Money: existing app cents→display formatter with **default_currency** (D-11), grouped, tabular.
- Percent: 1 decimal (e.g. `8.0%`), signed for deltas (`+8.0%` / `−1.8%`); `null` → `—`.
- Cushion real months: 1 decimal (`3.0 mo`).
- Chart values: cents→Number conversion happens in the FE hook selector (recharts needs Numbers), never in the API.

---

## Out of Scope (this phase)

- Per-user display-currency view of Overview (deferred — D-11 fixes default_currency).
- Drill-down from a chart into a filtered transactions list.
- Chart export / PNG.
- Finer-than-3h wealth ticks or pre-launch backfill (D-04 deferred).

---

## Phase 11 Implementation Hand-Off Checklist

- [ ] Chart wrappers (11-02) theme to the Color table only; no color outside it (DD-3).
- [ ] Cards (11-08) = hero capitalization + 2×2 (DD-1); default_currency; tabular figures; calm zero-states.
- [ ] Range selector (11-09) = segmented pills + Custom popover (DD-2); recurring/reserves labeled non-range.
- [ ] Sections collapsed by default (DD-4); lazy fetch on open.
- [ ] Planned: category selector default All; real solid yellow / planned dashed neutral.
- [ ] By-category bars use category `colorKey`; pie uses `UI_TYPE_COLOR`.
- [ ] Wealth grow/MoM use trading green/red + arrow + sign; `null`→`—`.
- [ ] Pie tap(mobile)/hover(desktop) reveals share% + type label; text fallback in legend.
- [ ] 375px: no horizontal scroll (SC1); touch targets ≥44px.
- [ ] All copy keys present EN/PL/UK (11-10), tabular numerals, no layout shift on revalidate.

---

## Checker Sign-Off

- [x] Decisions DD-1..DD-4 resolved with the user (2026-06-28).
- [x] Chart deviation bounded + documented (Color table) — consistent with DESIGN.md single-accent rule + Phase-9 precedent.
- [x] Copy contract enumerated for EN (PL/UK parity enforced by 11-10 key-parity test).
- [x] Accessibility: color-not-sole-signal, keyboard, SR names, tap targets.
- [x] Maps to SC1, SC2, SC3, SC4, SC5, SC7, SC9 + D-18/19/20/21.

**Approval:** approved 2026-06-28
