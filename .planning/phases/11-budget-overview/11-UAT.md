---
status: testing
phase: 11-budget-overview
source:
  [
    11-01-SUMMARY.md,
    11-02-SUMMARY.md,
    11-03-SUMMARY.md,
    11-04-SUMMARY.md,
    11-05-SUMMARY.md,
    11-06-SUMMARY.md,
    11-07-SUMMARY.md,
    11-08-SUMMARY.md,
    11-09-SUMMARY.md,
    11-10-SUMMARY.md,
  ]
started: 2026-06-28T20:08:21Z
updated: 2026-06-28T20:08:21Z
test_account:
  signin: https://budget-dev.madonzy.com/en/sign-in
  email: uat-overview-1782677147843@test.local
  password: OverviewUAT123!
  budgetId: bbd0c07b-83e0-4e5e-bb56-c2861c9ad3c4
preflight:
  budgeting_unit: 27 pass / 0 fail
  api_overview_routes: 14 pass / 0 fail (real Postgres)
  worker_snapshot_cron: 1 pass / 0 fail (real Postgres)
  web_components_i18n: 10 pass / 0 fail (vitest)
  e2e_overview: 10 pass / 0 fail (dev host, chromium + mobile)
  live_ui: cards + sections + wealth charts verified via Playwright on the seeded account
---

## Current Test

number: 5
name: Financial Wealth — capitalization stats + value & MoM charts
expected: |
Expand "Financial Wealth". Capitalization/Investments toggle (Capitalization
selected). Grow/loss amount + signed % + monthly-avg % (green up / red down
arrows). A value-over-time area chart + a month-over-month % bar chart both render
with axes. Sourced from the 3h wealth snapshots (SC8).
awaiting: user response
preflight: |
To verify.

## Tests

### 1. Overview is the first tab and shows the five summary cards

expected: First pill is "Overview" (selected). Five cards in USD — Capitalization $8,350.00, Available to spend $3,350.00, Available reserves $5,000.00, Overspent this month "1 category / Dining", Cushion "0.0 mo / $0.00". No horizontal scroll on phone width.
result: pass
note: |
PASSED after 12 rounds of UI iteration (default tab, formatting, feature-flag
gating, P/L, flip card, retirement+inflation, localized cushion units, currency
sign in PL/UK, overspent redesign, and the range-pinning saga — finally resolved
via an inner-scroll surface so the installed-PWA pills stay put). User: "now it
works perfectly."
prior_result: issue
reported: "1) opening a budget must land on Overview (was landing on Wallets). 2) Available-to-spend / reserves amounts show truncation dots ($3,350… / $5,000…). 3) pill icons too small + Overview pill shows no icon when selected."
severity: major
fixed: |

1. Default landing tab → overview. Changed bare-URL redirect (catch-all page),
   home BudgetCard href, and budget-switcher push from /wallets → /overview;
   realigned the affected E2E features + component tests to the new contract.
2. Card value font 32px (text-display-sm) was wider than the half-card at 375px
   so `truncate` clipped it to "…". Reduced to 20px (text-title-md); realistic
   amounts now fit fully (truncate kept only as an extreme-value guard).
3. Active pill icon SVG collapsed to width:0 (flex child, no shrink-0) once the
   label shared the row. Added `shrink-0` + bumped size 18px → 20px (size-5).

### 2. Four collapsible sections + shared range selector

expected: Below the cards a range selector (1M · 3M · 6M · 1Y · All · Custom) with "1M" active, and four sections — Planned, Overspent, Reserves, Financial Wealth — each COLLAPSED by default. Tapping a section header expands its body; tapping again collapses. Switching the range to e.g. 3M highlights the new preset as active.
result: pass

### 3. Planned section — budget-wide vs per-category

expected: Expand "Planned". A Planned-vs-Real chart shows budget-wide by default plus a category selector (default = none / All). Pick "Dining" (or "Groceries"/"Transport") → the chart re-scopes to that category's planned limit vs real confirmed spend. A planned-avg-vs-real-avg view is also present. Recurring charts reflect current recurring rules (none seeded → empty is fine).
result: pass
note: |
PASSED after rounds 13-17: backdated-limit repo fix, coloured/line-style tooltip,
category-axis width, localized month names in recurring tooltip, "All"-trim to
first data, chart left-align to header (no clip), short localized chart dates,
active-bar highlight, animated card figures, and BDP UI-state persistence across
pills. Also fixed: transaction edits now invalidate the Overview queries so it
refreshes live (was stale until the category dropdown changed).
prior_result: issue
reported: "1) Set a BACKDATED limit + transaction on Dining for a past month, but the chart showed the CURRENT month's limit for the past month, not the backdated one. 2) The chart point tooltip shows the values but it's unclear which colour maps to which line."
fixed: |

1. get-overview-cards/planned repo `monthlyPlannedByCategory` gated cat_month on
   `created_at <= month`, which DROPPED months before the category row's created_at
   — but a limit can be BACKDATED there. Removed that gate; the LATERAL join on
   category_limits.effective_from is the real per-month gate (a month yields a
   planned row only when a limit was effective then). Live: Dining timeline now
   2026-05 planned $50 (backdated) + 2026-06 $200 (current). monthlySpendByCategory
   never gated on created_at, so the past-month real spend already showed.
2. chartTooltip.itemStyle forced every row to one text colour. New shared
   ChartTooltipContent renders a per-row marker that copies the series' COLOUR
   AND line style (solid for Real, dashed for Planned) + name + value; wired into
   line/area/bar. Live: Real solid #fcd535, Planned dashed #707a8a.
3. (round 14) Vertical (recharts layout="vertical", category-axis) bar charts had
   a 96px Y-axis that left an empty strip beside short labels → reduced to 72px
   (live plotLeft 96→72). 4) Recurring-by-month tooltip showed the month NUMBER →
   now the full localized month name via a labelFormat (Intl month:'long' EN/PL/UK).
   severity: minor

### 4. Overspent + Reserves sections

expected: Expand "Overspent" → shows Dining as the overspent category (≈ $60 over its $200 limit), others not listed (they are under limit). Expand "Reserves" → shows reserve availability (the $5,000 Emergency Fund reserve wallet).
result: pass
note: |
Data confirmed correct by user ($1,800 Dining overspend = spent 2,000 − limit 200;
reserves per-category). Passed after rounds 18-20 polish: overspent = chart +
Wealth-style metric total, dim-on-hover bars, active-bar tap-dismiss + raised
tooltip, settings pill circle, light-theme drafts, more UI-state persistence.

### 5. Financial Wealth — capitalization stats + value & MoM charts

expected: Expand "Financial Wealth". Capitalization/Investments toggle (Capitalization selected). Stats: Growth $750.00 / +9.9% and Monthly avg +1.4% (green up arrows). A value-over-time line chart (~$7,600 → $8,350 over the last ~16 days) and a Month-over-month % chart both render with axes. These come from the 3h wealth snapshots (SC8).
result: [pending]

### 6. Wealth Investments view + per-type pie

expected: In Financial Wealth, switch the toggle to "Investments". The view marks Investments active and a per-type pie region appears. (This UAT account holds no investment instruments, so the pie has no slices — an empty/zero pie region is the expected state here. Slice tap→share% is exercised by the automated E2E.)
result: [pending]

### 7. Archived categories stay in history, drop from current cards

expected: Archived categories are excluded from the current-month cards and forward planned-average, but remain in charts/totals for past periods where they had activity. (No archived category is seeded on this account — this rule is already covered by passing integration tests get-overview-overspent / get-overview-wealth. Skip unless you archive a category with prior spend and inspect a past range.)
result: [pending]

### 8. Localization — EN / PL / UK

expected: Switch the app language to Polski then Українська (language switcher in the top bar, or /pl/ , /uk/ in the URL). Every Overview string — card titles, section names, range presets, empty states — is translated; no raw keys (e.g. "bdp.tab.overview…") and no leftover English.
result: [pending]

### 9. Fresh reload paints from cache, then revalidates

expected: Hard-reload the Overview tab (or reopen the app). It paints the five cards quickly from cache, then revalidates in the background with no errors, blank screen, or stuck spinner. (Smoke test — boot/migrations/worker were touched this phase.)
result: [pending]

## Round 2 — Test 1 follow-up fixes (9 items)

1. Opening a budget lands on Overview (home card + switcher + bare-URL default → /overview; specs realigned).
2. Cushion card hidden entirely when the cushion feature flag is off (was "Cushion off").
3. Reserves feature flag: added the missing Settings → Reserves toggle (PATCH reserves_enabled); Overview now hides the available-reserves card AND the Reserves section when off (mirrors the hidden pill).
4. All Overview amounts use `centsToDisplayCompact` (drops `.00` like the spendings grid).
5. Cushion runway renders as "Xm Yd" (e.g. 6m 24d), not decimal months.
6. Chart tooltips now format cents → currency (axes already did); pie shows share %.
7. Range: "Month" → "1M", added "6M"; preset row + custom date inputs centered.
8. Blue focus outline suppressed on recharts surfaces (was triggered by tapping a chart).
9. Reserves section shows every category even at a zero reserve (zero reserves visible) instead of the empty state.

i18n: EN/PL/UK updated (settings.sections.reserves, budget.reserves.\*, range 1m/6m). Component tests + typecheck green pre-rebuild.

## Round 3 — Test 1 follow-up fixes

1. Range "Year" → "1Y" (uk "1Р").
2. Reserves flag now reactive: budget-detail reads reservesEnabled from the live `useBudget` query (key the toggle invalidates), so the Reserves pill + Overview card/section hide/show WITHOUT a reload. (Previously it was a static server prop.)
3. Capitalization hero gains a P/L banner (signed % + amount, green/red arrow, "since last month") — reuses the wealth endpoint over a trailing-1-month range; null-safe when no snapshots.

i18n EN/PL/UK updated (cards.sinceLastMonth, range year). Component tests + typecheck green.
NOTE: on the seeded UAT budget the P/L % shows large because 2 demo holdings got priced mid-period (snapshots ~$8k, live ~$75k) — feature-correct, data-transitional.

## Round 4 — Test 1 follow-up fixes

1. Financial Wealth capitalization/investments toggle is now centered (justify-center;
   live-measured group center == section center, 0px delta).
2. Investments feature flag gates both the "incl. investments" capitalization sub-line
   AND the Financial Wealth view toggle: with Investments OFF neither shows
   (capitalization-only); with it ON both return. Threaded investmentsEnabled
   budget-detail → OverviewTab → cards + wealth section, read live from `useBudget`
   (the Settings → Investments toggle invalidates it → reacts without reload).
3. Capitalization P/L moved to the RIGHT of the big number (was below): number left,
   signed %·amount + "since last month" right-aligned on the same row.
4. Cushion runway drops zero components and adds a years unit: 0 → "0d", 6 months →
   "6m", 5 months 3 days → "5m 3d", 15 months → "1y 3m" (never a "0" part). Added a
   coverage indicator — green ShieldCheck when the cushion meets its required limit,
   amber ShieldAlert when it falls short. New backend field cushion.covered
   (actual ≥ required) in get-overview-cards + route + hook DTO.

Tests: backend unit get-overview-cards 6/6 (covered both branches), api route 3/3
(covered=false), Vitest overview-cards + i18n parity 74/74 (runway y/m/d cases,
coverage icon, investments-off gating), full typecheck 0 errors, @overview E2E 10/10
on dev host (chromium + mobile). E2E wealth-snapshot seed now also enables
investments_enabled so the toggle renders (matches the new gating contract).

## Round 5 — Test 1 follow-up fixes (big-number formatting + 9 items)

0/5. Capitalization layout: big six-figure values no longer push the P/L off the
card edge. Hero is now two equal-height columns (items-stretch + justify-between):
left = big number over "incl. investments", right = P/L stacked vertically
(%, amount, "since last month"). flex-wrap drops the P/L below the number only at
extreme widths instead of clipping. (In long-label locales the P/L can wrap below
the number — graceful, never clipped.)

1. "Available to spend" redesigned: wallet cash on top with a good/bad dot (green
   CircleCheck when wallets cover what's left to spend, red CircleAlert when short),
   then Spent (this month) + Left (budget remaining) below. New backend block
   cards.spendings {spent, left, wallet, good}.
2. Cushion short-icon is now red (trading-down), was amber.
3. "Available reserves" gains a status indicator: green when wallets exactly cover
   the required reserve, red when short, yellow when there's more than needed; shows
   "Needed {amount}". New backend block cards.reserves {required, wallet, status}
   derived from get-reserves-summary (internal vs userDefined / direction).
4. Financial Wealth stat row (Growth · Growth · Monthly avg) centered.
5. Overview money always formats with the EN locale → currency symbol ($) instead of
   the ISO code (PL/UK showed "USD"), EN grouping. Applied to cards, wealth, planned,
   overspent/reserves + chart axes/tooltips.
6. Range presets are literal "1M / 3M / 6M / 1Y / All / Custom" in every locale (not
   translated).
7. Custom range from/to reuse the shared DateInput (localized overlay, dark calendar)
   from the recurring-rules form instead of bare native inputs.
8. Range selector sticks just under the BDP pills band while scrolling (item 9). In
   browser mode the app header + pills both pin, so global.css offsets
   [data-overview-range-sticky] by header+pills height (mirrors [data-bdp-tabs]);
   standalone keeps the top-12 (pills-height) offset. Live-measured: pins at 114px,
   not occluded.

i18n EN/PL/UK updated (cards.spentThisMonth/leftToSpend/reservesNeeded + indicator
aria). Tests: backend unit get-overview-cards 10/10 (spendings + reserves blocks,
good/short/surplus), api route 3/3, Vitest overview + i18n parity 80/80 (spend +
reserves indicators, split P/L), full typecheck 0 errors, @overview E2E 10/10 on dev
host. Live-verified EN + PL (currency $, presets literal, sticky range, DateInput
"1 cze 2026").

## Round 6 — Test 1 follow-up fixes (big-number formatting + 7 items)

1. Capitalization + P/L now round to whole units (no cents) AND the hero font
   shrinks with the string length (40→32→24px), so a 7-figure value keeps the P/L
   beside it instead of pushing it off / wrapping. Live: `$7,075,137` + P/L
   `$7,067,537` on one row.
2. "since last month" rendered smaller (10px).
3. "Left" → "To spend" (leftToSpend label, EN/PL/UK).
4. Overspent card redesigned to match the others: green CircleCheck = on budget,
   red CircleAlert = overspend (icon + status).
5. New retirement-runway banner under the hero: "If you retire now {Ny Mm}" —
   capitalization ÷ normal monthly planned spend (NOT cushion), years+months only.
   New backend field cards.retirement_months (null when no planned spend → banner
   hidden); spendings.plannedCents summed for the burn rate.
6. Range selector stays pinned, but on the INSTALLED PWA (standalone) the BDP pills
   reportedly vanish on deeper scroll. NOT reproducible in the test browser — in
   browser mode pills stay pinned (65–114px) at every scroll depth, range at 114.
   This is a standalone-only sticky interaction; FLAGGED for device retest. If it
   persists the robust fix is to relocate the range into the always-pinned nav band
   (single sticky band, no double-sticky) — pending user confirmation.
7. Custom-range DateInput no longer wraps to two lines (whitespace-nowrap + min
   width on the shared overlay field); live: "1 Jun 2026" / "30 Jun 2026" one line
   (UK "1 черв 2026" too).

i18n EN/PL/UK updated (cards.retirementRunway, leftToSpend reworded). Tests:
backend unit 12/12 (retirement + null), api route 3/3, Vitest overview + i18n 83/83
(rounded hero fit, overspent icon, retirement banner), full typecheck 0, @overview
E2E 10/10. Live-verified EN. NOTE: on the demo account the retirement + cushion
runways read as centuries because the demo capitalization is a transitional ~$7M
against a small planned spend — feature-correct, data-driven.

## Round 7 — Test 1 follow-up fixes (9 items)

1. Overspent "On budget" text now body-on-dark (matches the other cards) and wraps
   instead of truncating (the long UK "У межах бюджету" fits).
2. Overspent label drops "this month" → just "Overspent".
3. leftToSpend renamed "Upcoming" / PL "Przyszłe" / UK "Майбутні".
4. Reserves note is status-aware: surplus "Too much. Only {amount} needed", short
   "Not enough. {amount} needed", ok "Needed {amount}".
5. Cushion sub-line now shows Saved (actual) + Needed (required) instead of
   total·real-months. New backend field cushion.required_cents.
6. Cushion icon is a circle (CircleCheck/CircleAlert) to match the other cards.
7. Financial Wealth growth is ONE metric — amount + signed % together ("$74,395
   +978.9%"); the duplicate growth-% stat is gone.
8. Range selector moved INTO the pinned BDP nav band (rendered under the pills on
   the Overview tab via OverviewRangeProvider/OverviewRangeBar; range read from
   context by the sections). The page no longer has a second sticky element, so the
   pills can't be hidden by it — single sticky band, verified pinned together
   (65–175px) at scroll. Fixes the standalone pills-vanish (item 6 of round 6).
9. Capitalization is a FLIP card: tap rotates it horizontally (rotateY, 500ms) to a
   back face showing the retirement runway with a FULL localized label ("7 years and
   2 months", ICU plurals EN/PL/UK). The separate retirement banner is removed.

i18n EN/PL/UK updated (years/months/and plurals, retirementSub, flipToRetirement,
reserves\*Note, cushionSaved/Needed, overspent/leftToSpend reworded). Tests: backend
unit 12/12 (+required_cents), api route 3/3, Vitest overview + i18n 83/83 (flip back,
cushion have/needed, reserves notes, range via context), full typecheck 0, @overview
E2E 10/10. Live-verified front + flipped back on dev host.

## Round 8 — Test 1 follow-up fixes (8 items + white-screen hotfix)

HOTFIX (between rounds): the round-7 range CONTEXT hook threw without its provider;
a stale PWA service worker pairing old+new bundles white-screened the Overview.
Made the hook degrade — but round 8 then removed the context entirely (item 2).

1. Removed the flip "reload" icon from the capitalization card; reworded the flip
   back to "If you retire now, your money will last for {N years and M months}"
   (UK "Якщо вийти на пенсію зараз, грошей вистачить на …").
2. Range moved BACK out of the pinned band — it sits in flow below the cards and
   only sticks under the pills once scrolled to the charts (in-flow sticky; live:
   y=636 at top, pins at 114 below the pills when scrolled, pills stay 65–114).
   Context/provider removed → no throwing hook.
3. Capitalization amount is yellow again. ROOT CAUSE: tailwind-merge dropped
   `text-[var(--primary)]` as a conflicting `text-*` against the custom
   `text-num-display` size class (rendered grey #EAECEF). Fixed with an inline
   `style={{color:"var(--primary)"}}` (verified rgb(252,213,53)).
4. Cushion runway units localized (EN y/m/d, UK р/м/д, PL l/m/d) — live UK "7м 11д".
5. Overspent redesign: clean → green "$0" + a motivational line; over → the RED
   TOTAL overspend amount + the category list. New backend overspent.total_cents.
6. Financial-Wealth metrics unified — growth (amount+%) and monthly-avg now share
   the same value size (text-num-md, both 16px live) so they read as one row.
7. Overview section queries (overspent/reserves, planned, wealth) now
   refetchOnMount:"always" — a reserve edited in the Reserves tab shows fresh on
   Overview without a reload (symmetric with the cards hook).
8. Retirement runway is inflation-adjusted (4.5%/yr): geometric drawdown
   N = ln(1+W·r/s)/ln(1+r); the back shows "incl. 4.5% annual inflation". New
   backend retirement_inflation_pct. (On the demo this drops 620y → ~6y.)

i18n EN/PL/UK (retirementRunway reword, retirementInflation, unitY/M/D,
overspentMotivation). Tests: backend unit 12/12 (overspent total + inflation), api
route 3/3, Vitest overview + i18n 82/82, full typecheck 0, @overview E2E 10/10.
Live-verified EN + UK (yellow cap, in-flow sticky range + pills stay, localized
cushion units, inflation note).

## Round 9 — Test 1 follow-up fixes (3 items)

1. Overspent AMOUNT is no longer colored — the value renders neutral
   (body-on-dark); only the status icon keeps green/red.
2. PILLS no longer vanish on scroll (standalone PWA). ROOT CAUSE: the in-flow
   sticky range was a SECOND sticky element competing with the pills band — iOS
   WebKit dropped the pills (browser was fine, so it never reproduced here). FIX:
   the range now sits in flow below the cards (not sticky); once it scrolls up to
   the band, a COPY is portalled into an absolute overlay slot ON the band
   (#bdp-overview-range-slot) — so the band is the ONLY sticky element. Live: at
   top the slot is empty; scrolled, pills stay pinned (65–114) with the range
   overlay directly under them (121), no gap/clipping. A rAF-throttled scroll
   measurement (capture:true) tracks both scroll models + the band moving as the
   header/banner scroll away.
3. Financial-Wealth growth is SEPARATE metrics again — amount ("Growth $73,648")
   and percent ("Growth +969.1%") as two stats, both at the uniform text-num-md
   size (kept from round 8), beside Monthly avg.

Tests: Vitest overview + i18n 82/82, full web typecheck 0, @overview E2E 10/10.
Live-verified EN (overspent neutral amount, 3 separate wealth metrics, range
overlay pins on scroll with pills intact).

## Round 10 — Test 1 follow-up fixes (range pinning + 1 i18n)

1+2. Range pinning rebuilt to fix the standalone-PWA issues (band un-stuck on deep
scroll; pin jumped + looked merged into the pills band). ROOT CAUSE of the
un-stick: round-9's ABSOLUTE overlay child on the sticky band broke iOS WebKit
sticky. NEW design: the in-flow row stays below the cards; once it reaches the
band, a COPY is rendered `position: fixed` and PORTALLED TO <body> — fixed (not
sticky, so iOS can't drop it; portalled out of the carousel/flip-card transform
so the fixed origin is the viewport) at the band's LIVE bottom. Result: lands
exactly where the in-flow row is → no jump; a SEPARATE row with its own border
below the pills (not inside them); the band itself is a clean sticky again (no
weird child) so it stays pinned at every depth. Live: at top no fixed row;
scrolled mid + deep (y=700, 1500) pills stay 65–114 and the fixed range sits at
114, in <body>, position:fixed. 3. Range presets: "All"/"Custom" now localized (UK "Усе"/"Інше", PL "All"/"Inne");
1M/3M/6M/1Y stay literal.

Tests: Vitest overview 17/17 + i18n parity 65/65, full web typecheck 0, @overview
E2E 10/10. Live-verified EN/PL/UK labels + the fixed range pin across scroll depths.

## Round 11 — Test 1 follow-up fixes (range pinning v3 + 1Y i18n)

1. 1Y localized: PL "1R", UK "1Р" (EN "1Y"); 1M/3M/6M stay literal.
   2+3. Range pinning switched from `position: fixed` (round 10) to `position: sticky`.
   WHY: in the installed PWA `fixed` drifted/scrolled with content (it's relative to
   the layout viewport, which iOS mis-handles under the locked-body + inner-scroll
   shell) and the JS threshold gave a 1-2px pin jump. `sticky` is what the pills band
   itself uses — relative to the SCROLL CONTAINER (the inner main in standalone, the
   page in browser), and the engine handles the pinning so there is NO jump. Its
   `top` is computed from the band's OWN resolved sticky-top + height
   (getComputedStyle(band).top + offsetHeight) → 114px in browser (header sticky too)
   / ~48px standalone (header isn't) — flush under the pills, no gap, no scroll
   dependency. Own border = separate row, not merged into the pills. Live: position
   sticky, top 114, gap 0 from the pills at y=700 AND y=1600 (stays at depth).

Tests: Vitest overview + i18n 82/82, full web typecheck 0, @overview E2E 10/10.
Live-verified EN/PL/UK (1R/1Р) + the sticky range offset across scroll depths.

## Round 12 — Test 1 follow-up (border-on-pin + iOS double-sticky decision)

2. The sticky range row now shows its `border-b` ONLY while pinned; in flow below the
   cards it's borderless (live: y=0 pinned=false border 0px; y=800 pinned=true border
   1px). Pin state tracked by a rAF scroll measurement of the row's top vs its sticky
   offset.
1. PILLS scrolling away on DEEP scroll in the installed PWA — ROOT CAUSE: two
   `position:sticky` (pills band + range) in the INNER main[data-shell-scroll]
   scroller; iOS WebKit drops the pills only in that inner-scroll (standalone) model
   (Safari root-scroll handles two stickies). Confirmed across sticky/fixed/overlay/
   portal variants (rounds 5-12). FIX (user chose option A): the Overview now owns
   its OWN inner scroll surface like the Spendings tab. OverviewTab is an
   `overflow:auto` container sized by useViewportFillHeight (`--grid-max-h` =
   measured-top + 100lvh + screen-ext, extracted from the spendings shell math) with
   an in-flow tail spacer + data-no-page-clearance; the range is `sticky top:0`
   INSIDE it. So the range pins to that container, not main — `main` is left with the
   pills as its ONLY sticky → no two-sticky conflict. Live (browser): the tab is a
   630px auto-scroller (scrollHeight 1517), scrolling IT pins the range flush under
   the pills (gap 0) while the pills stay. NEEDS device retest for the standalone
   confirmation (can't repro the PWA scroll model here).

Tests: Vitest overview 4/4, full web typecheck 0, @overview E2E 10/10.

## Round 13 — Test 3 (Planned) fixes

1. Backdated past-month limit not shown in the timeline: `monthlyPlannedByCategory`
   gated the `cat_month` CTE on `to_char(c.created_at) <= m.month`, hiding limits
   backdated before the category's created_at. Removed that gate — the LATERAL join
   on `category_limits.effective_from` is the real window. (overview-repo.ts)
2. Tooltip "unclear which colour is which": replaced the default recharts tooltip
   with `ChartTooltipContent` — a per-row solid/dashed line marker in the series'
   own colour + name + value.

## Round 14 — Test 3 (Planned) fixes

1. Empty left strip on vertical (category) bar charts: reduced the category YAxis
   width 96→72 (labels are short). (bar-chart.tsx)
2. Recurring-per-month tooltip showed the month NUMBER (8): added `labelFormat` →
   localized full month name via `Intl.DateTimeFormat`. (planned-section.tsx)

## Round 15 — Test 3 (Planned) fixes

1. "All" timeline started 58 months before the first data: added `trimLeadingEmpty`
   (drop leading rows where every value key is 0), applied only when `range.preset
=== "all"`. Live: 61-month "All" trimmed to 3 (Apr–Jun). (planned-section.tsx)
2. Charts start too far from the left edge: reduced OverviewSection horizontal
   padding 16→8px (px-2) so headers + charts sit tighter to the card edge, aligned.
   Live: content left x=33→25 (card edge x=16). (overview-section.tsx)

## Round 16 — Test 3 (Planned) bug: Overview stale after a transaction edit

- Editing a transaction (e.g. moving the date) did NOT refresh Overview → Planned/
  cards; only changing the category dropdown (a query-key change) updated it, and a
  page reload didn't help either. ROOT CAUSE: the three transaction mutations
  (`use-create/update/delete-transaction`) invalidated transactions, spendings-
  summary, reserves, tasks — but NOT `["budget", id, "overview"]`, and the client
  carousel keeps the Planned section mounted, so navigating back never remounts →
  never refetches. FIX: added `invalidateQueries({queryKey:["budget", id,
"overview"]})` to all three `onSettled` (partial key → every range/category
  variant + cards/overspent/wealth). Regression test in
  use-update-transaction.test.tsx asserts the overview invalidation.
- Verified live: quick-add $100 in Spendings → click Overview pill (NO reload) →
  Spent $0→$100, Upcoming $950→$850 immediately; deleting reverts to $0.

Tests: use-update-transaction 2/2, @overview E2E 10/10, web typecheck 0.

## Round 17 — Test 3 (Planned) polish, 5 items

1. Card figures now COUNT up/down when fresh data replaces the cached snapshot
   (reserves-cover reveal generalized): new `useAnimatedNumber` (rAF easeOutCubic,
   float) + `AnimatedFigure` wrapper on all 5 overview cards (capitalization + P/L,
   available-to-spend/spent/left, reserves, overspent, cushion runway/saved/needed).
   Live: sampled a card figure counting 2000→2013→2036→…→2100 (easeOut curve).
2. Charts now start at the section header's left edge: `leftAlignedYTick(width)` in
   chart-theme (textAnchor:start + dx) on every Y-axis. dx tuning: -(width-2) then
   -(width-6) still landed ~3px OUTSIDE the SVG edge → first glyph truncated on
   device ("Groceries"→"roceries"). Final dx=-(width-14) → every label ≥5px inside
   the SVG (verified minRel=5 at 390px/UK), fully visible, ~6px right of header.
3. Hovered (desktop) / tapped (mobile) bar is highlighted via recharts `activeBar`
   (bright outline). Live: the Transport bar shows a white outline with its tooltip.
4. BDP UI state persists across pill navigation, resets on leaving the budget: new
   `BdpUiStateProvider` (useRef store in BudgetDetail — survives pane unmounts, dies
   on BDP unmount). Persists Overview range + open sections + scroll, Spendings
   scroll; Spendings month rides the ?month URL param (select() now preserves
   window.location.search across the tab pushState). Scroll restore polls frames
   (`restoreScroll`) until the pane's content is tall enough to reach the offset (a
   one-shot rAF clamped to 0 on the empty remount). Live: 6M + planned/wealth open +
   overview scroll 300 + spendings month 2026-06 + grid scroll 49 all survive an
   overview↔spendings↔overview round-trip.
5. Chart dates are short + localized ("12 Feb 2026" / "Feb 2026") instead of ISO:
   new `formatChartDate`; wired as xTickFormat + tooltip labelFormat on the planned
   timeline + wealth area/dynamics charts. Live: X-axis reads "Feb 2026 · Mar 2026 …".

Tests: chart-date-format 4/4, use-update-transaction 2/2, @overview E2E 10/10,
web typecheck 0.

## Round 18 — Test 4 feedback (10 cross-cutting items)

Test 4 DATA confirmed correct by user ($1,800 Dining overspend = spent 2,000 − limit
200). 10 polish items raised + fixed:

1. Overspent section restructured — the giant `$1,800` + full-width single bar read
   "huge/unstructured"; now a modest "Total" figure + a per-category list (color dot
   - red amount). (overspent-reserves-section.tsx)
2. Planned first two charts got headers ("Planned vs Real", "Average by category").
3. Removed "current config" from the recurring + reserves chart labels.
4. Recurring-by-month X-axis shows short localized month names (Feb/Apr…) not numbers.
5. Bar highlight now DIMS the other bars (fillOpacity 0.3) on hover/tap instead of a
   border outline — bar-chart tracks activeTooltipIndex + per-Cell opacity.
6. Desktop pinned range border is full-bleed (calc(-50vw+50%) + w-screen, sm-only so
   the iOS-phone pinning path is untouched); live width 1600 on a 1600 viewport.
7. Profile menu closes on theme toggle (toggleTheme → setOpen(false)).
8. Pending/"TO CONFIRM" drafts lane was hardcoded #181c22 → dark in light theme; now
   var(--surface-sunken-dark) (flips to #e7eaef). draft-row + category-column.
9. Desktop overview scroll: the inner scroller is now full-width (content centered at 1280) so wheeling over the side margins scrolls; live scrollerWidth 1600.
10. Wallets/reserves/settings page-scroll now persists across pills (per-tab ref in
    BudgetDetail; save outgoing / restore incoming, poll for content height). Live:
    wallets 57→57 across a round-trip.

Tests: @overview E2E 10/10, web typecheck 0, all items live-verified (desktop 1600 +
phone 390, light + dark).

## Round 19 — Test 4 follow-ups (4 items)

1. Settings pill is icon-only on mobile even when active — the long UK label
   "Налаштування" overflowed the pill row (clipped). Desktop (sm+) still shows it.
   Live: navScrollW == clientW == 390 (no overflow). (bdp-tabs.tsx)
2. Persist MORE UI state across pills for the BDP lifetime: tapped-open investment
   rows (mobile P/L expand) + open Settings accordion sections. Added wallets +
   settings slices to the BdpUiStore; investment-row seeds/writes expandedRows[id];
   SettingsAccordion is now CONTROLLED (value/onValueChange → store, default
   ["budget-identity"] when store null / standalone). Live: BTC row aria-expanded
   false→true→true and Cushion section false→true→true across a pill round-trip.
3. Overspent reverted to a CHART (user wanted the chart, not the list) — the
   by-category bar chart is back, kept the smaller total (no display-sm hero).
4. Overspent total rendered as a Financial-Wealth-style metric (caption label above,
   num-md red value, centered) instead of a big inline figure.

Tests: @overview E2E 10/10, 80 component tests (incl. bdp-tabs + settings-accordion),
web typecheck 0.

## Round 20 — Test 4 follow-ups (2 items)

1. Settings pill icon now perfectly centered in a 44×44 circle. The always-present
   (empty) badge span + gap-1.5 shoved the icon off-centre on an icon-only pill;
   render the badge only when count>0. Live: pill 44×44, icon dx/dy offset 0.
2. Bar-chart tooltip: (a) tap the already-open bar (or the tooltip, which is now
   pointer-events:none pass-through) hides it — implemented via a press-start ref so
   the tooltip still shows on hover/touch-move (no mobile regression) and onClick
   only DISMISSES a re-tap; (b) raised 18px (translateY) so the finger doesn't cover
   it. Live (desktop): hover shows raised tooltip + dim intact, leave hides.
   Tap-dismiss is touch-only (device confirm).

Tests: @overview E2E 10/10, chart + overview-sections component 9/9, typecheck 0.

## Round 21 — Test 5 (Wealth) — infra bug + task rename

Test 5 renders correctly on 6M/All (growth stat + value area + MoM bar). User noticed
only 2 wealth points on 3M.

- ROOT CAUSE (wealth data): the deployed budget-worker IMAGE was built 2026-06-27, but
  the 3h wealth-snapshot cron landed 2026-06-28 (07015ec) — the running worker had no
  wealth code, so the cron never registered (pgboss.schedule/queue empty). Last
  snapshot = June 27. FIX = rebuild + force-recreate the worker; cron now registered
  and a triggered run wrote a snapshot (scanned=930 inserted=930). See
  [[project_wealth_snapshot_stale_worker]]. Chart shows monthly points on 3M by design
  (chooseBucket: daily ≤62d, else monthly).
- Task rename (user request): CONFIRM_DRAFT title → `Confirm "{name}" in {category} —
{amount}` (no note → `Confirm transaction in {category} — {amount}`). Category name
  resolved on the frontend from payload.category_id via useCategories (no re-emit, works
  for existing tasks); ICU `variant` select in en/pl/uk. Live: "Confirm transaction in
  Transport — $563". Tests 14/14.
- FOUND (separate, unfixed): budgeting-reconciliation fails per-tenant on
  `corrects_id does not exist` (migration 0013 dropped the col; reconcile/replay/search
  - the drizzle schema still query it). Awaiting go-ahead to fix.

## Summary

total: 9
passed: 4
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

- truth: "Opening a budget lands on the Overview tab; card amounts render in full; pill icons are visible (incl. the active Overview pill)."
  status: fixed_pending_retest
  reason: "User reported on Test 1: budget opened on Wallets not Overview; available-to-spend/reserves amounts truncated with '…'; pill icons too small + active Overview pill had no visible icon."
  severity: major
  test: 1
  root_cause: "(1) bare-URL redirect + home card href + switcher push all targeted /wallets. (2) text-display-sm (32px) + truncate clipped 9-char money strings in the 375px half-card. (3) active-pill icon SVG had no shrink-0 so it collapsed to width:0 when sharing the row with the label."
  artifacts:
  - path: "apps/web/src/app/[locale]/(app)/budgets/[id]/[[...tab]]/page.tsx"
    issue: "default redirect → /wallets"
  - path: "apps/web/src/components/budgeting/budget-card-client.tsx"
    issue: "home card href → /wallets"
  - path: "apps/web/src/components/budgeting/budget-switcher.tsx"
    issue: "switcher push → /wallets"
  - path: "apps/web/src/components/budgeting/overview/overview-cards.tsx"
    issue: "value font too wide → truncation dots"
  - path: "apps/web/src/components/budgeting/bdp-tabs.tsx"
    issue: "active pill icon collapses to width:0"
    missing: []
