---
status: testing
phase: 09-investments-wallet
source: [09-07-SUMMARY.md, 09-ADDENDUM-type-first.md, 09-HUMAN-UAT.md]
started: 2026-06-21
updated: 2026-06-21
---

## Current Test

number: 6
name: Live tracked-instrument price (needs provider API keys)
expected: |
  selecting a tracked instrument (e.g. AAPL) fetches a live current price shown
  read-only with "Last updated …"; P/L computes against it. Requires Finnhub /
  Twelve Data / CoinGecko keys. Until then the price-blocked banner shows.
awaiting: user response

## Pre-flight verification (Claude, before human UAT)

Run on the live stack (budget-dev.madonzy.com) + full automated suites BEFORE
presenting any test, per owner instruction.

Automated (all green): domain 19/19 · adapters+ports+repo 23/23 · api routes 4/4
· worker 1/1 · web vitest 12/12 · E2E @investments-wallet 6/6 (0 flaky).

**Bug found + fixed during pre-flight** (see Gaps → fixed): "add holding → reload
→ row persists" E2E was ~50% flaky (measured 5/10 fail, both desktop+mobile). Not
a test artifact — a real client bug: on reload shortly after a create, the page
hydrated a stale-empty persisted React-Query snapshot and `staleTime:30s` treated
it as fresh, so the just-added holding rendered empty although the server (GET 200)

- DB had it. Fix = write-through persist on create (persistNow in onMutate/onSettled,
  query-persist.ts + use-create-holding.ts). Re-measured 20/20 pass, 0 flaky.

UAT account (live): see the message accompanying Test 1.

## Tests

### 1. Group redesign — interleaved sortable groups + group-as-row header

expected: |
Groups behave like first-class rows in ONE interleaved list:

- each group has its own drag handle; dragging it moves the whole block
  (all children) as a unit; a loose row can sit between two groups.
- drag a holding onto a group header / a row in another group → joins it;
  drag within a group → reorders inside it; drop on a wallet section → rejected.
- group header mirrors a row: DESKTOP shows name · budget-ccy · amount · P/L% ·
  portfolio% inline; MOBILE shows name · budget-ccy · amount, and tapping the
  group reveals P/L% + portfolio% (same as a row).
- group amount = Σ children value (budget ccy); group P/L = cost-basis blended.
- group children render indented (left rail).
  note: |
  Implemented in this UAT pass (group redesign, 4 owner requirements). Verified:
  pure interleave/reorder/aggregate logic 11/11 (investment-grouping.test); group
  header presentation 7/7 (investment-group-header.test); full web vitest 846 pass
  (1 unrelated pre-existing flake); typecheck + i18n gate pass; @investments-wallet
  E2E 6/6. Live (budget-dev, desktop + 390px mobile): group headers render with
  amount/P/L/portfolio + indented children; mobile collapsed = name·ccy·amount,
  tap → +25.2% · 82.9%; aggregates match (Brokerage +25.2%/313,000, Metals
  +20.0%/9,600). The drag GESTURE is human-only (Playwright can't drive @dnd-kit
  pointer sensors); the reorder + group-change data-paths are unit-proven + the
  PATCH/reorder endpoints verified live.
result: pass
note_pass: |
  Owner confirmed after extensive iteration. DnD reworked to the canonical
  @dnd-kit grouped-sortable (onDragOver live-move, no overlay,
  animateLayoutChanges) — reorder/join/move-out/group-block-drag all smooth,
  land in place, no jump/overflow. Committed b002a74. Same drop-jump fix applied
  to wallets (51d0148).

### 2. Mobile three-gesture coexistence (<768px)

expected: tap a row expands P/L%+weight%; swipe-left reveals Edit+Delete;
long-press the handle starts drag — the three gestures do not collide.
result: pass
note_pass: |
  Owner confirmed on device. Mobile cash row also reworked this pass: the empty
  P/L middle line dropped, then a dash "—" placed in the profit slot so the
  expanded card is a uniform 3 rows (name / — · ccy amount / Share) — verified
  live 390px. Crash on dragging the last item out of a group fixed (reverted the
  keep-empty-group augmentation).

### 3. Collapsible group persistence

expected: collapse/expand a group; reload → state persists (localStorage
inv-group-{budgetId}-{slug}); ungrouped rows always visible.
result: [pending]
note: |
  Pre-flight verified (Claude). Added durable E2E "A group's expanded state
  persists across a reload" (seed 2 grouped + 1 loose holding → expand →
  reload → group still expanded + child row + loose row visible): @investments-wallet
  8/8 (desktop+mobile). Live (budget-dev, 390px): expanding Brokerage wrote
  localStorage inv-group-1765d91e…-brokerage="1"; after reload Brokerage stayed
  Expanded (children shown), Metals stayed Collapsed, ungrouped Vintage car +
  Cash visible throughout.
result_pass: pass
note_pass: Owner confirmed on device.

### 4. Delisted + price-blocked chrome

expected: a delisted holding renders opacity-50, --muted-strong text, "Delisted"
chip, drag handle full opacity; an on-add price-fetch failure shows the
PriceBlockedBanner (role=alert, red left border) + disables Save + inline Retry.
result: [pending]
note: |
  Pre-flight (Claude):
  • Price-blocked banner — VERIFIED LIVE (budget-dev). Add investment → pick AAPL
    (tracked) → with no provider keys the instant price fetch fails → banner
    role=alert "Couldn't fetch the price — try again in a moment.", 4px red left
    border, inline Retry, Save disabled. 2 new integration tests (holding-sheet.test:
    failure→banner+disabled+Retry; Retry-success→banner clears). This also
    pre-confirms Test 6's blocked-state behavior.
  • Delisted chrome — BUG FOUND + FIXED. 09-07-PLAN requires the drag handle stays
    full opacity on a delisted row, but opacity-50 was on the whole row container
    (a parent's opacity caps children → handle was dimmed too). Moved the dim onto
    the content siblings; handle stays full opacity. investment-row.test 10/10
    (incl. new handle-opacity test). HOWEVER row-level isDelisted is hardcoded
    false in list-holdings.ts (per-row enrichment deferred to P07, documented) —
    so a delisted row CANNOT be produced live yet; chrome is unit-proven only.
result_pass: pass
note_pass: |
  Owner confirmed. Banner live-verified. During Test-4 iteration the owner also
  requested HoldingSheet UX fixes (all shipped + verified live): search loader
  spinner + 400ms debounce; "Keep editing" no longer dead (sheet outside-close
  suppressed so the discard dialog can't re-trigger it); Group field grey fill +
  no keyboard-on-open; and the price error moved from top-of-form to the Current
  price field (reads as price-related). investment/sheet/search vitest 30/30,
  @investments-wallet E2E 8/8.

### 5. Visual contract (DESIGN.md authority)

expected: P/L is text-only green/red (not a filled badge); dashed add button is
NOT yellow; the ONLY yellow is the sheet Save CTA + the Wallets pill; all numbers
use the tabular numeric font (IBM Plex Sans), never Inter.
result: [pending]
note: |
  Pre-flight (Claude, live computed-style audit of the investments section):
  • P/L = text-only — colored span, backgroundColor rgba(0,0,0,0) (no filled badge).
  • Dashed add button — border rgb(112,122,138) (--muted-foreground), dashed,
    bg transparent → NOT yellow.
  • Yellow scan of the whole section → 0 elements with yellow text/bg/border.
    The brand yellow (#fcd535) appears only on the Wallets pill + the sheet Save
    CTA (+ app chrome: logo, PWA install banner) — none inside the section.
  • Numbers — all 19 number-bearing leaves render IBM Plex Sans; the only "digit"
    in Inter is the instrument NAME "S&P 500" (correct — names use the body font).
result_pass: pass
note_pass: |
  Owner confirmed (under the renamed Assets tab). During this pass the owner also
  reworked the HoldingSheet type-first flow (all shipped + verified): no type
  preselected ("Select a type" placeholder; nothing focused on open; fields appear
  only after a type is chosen), "Other" moved last in the type list, and the Type
  dropdown now closes on a trigger tap (controlled open + reopen-guard — Radix
  close-then-reopen race on touch). Section name kept as "Investments"; tab renamed
  Wallets→Assets. holding-sheet/instrument/investment vitest 45/45,
  @investments-wallet E2E 8/8.

### 6. Live tracked-instrument price (needs provider API keys)

expected: selecting a tracked instrument (e.g. AAPL) fetches a live current price
shown read-only with "Last updated …"; P/L computes against it. Requires
Finnhub / Twelve Data / CoinGecko keys in Infisical (\*\_API_KEYS). Until then the
price-blocked banner shows.
result: [pending]
note: |
  Unblocked: owner added FINNHUB/TWELVE_DATA/COINGECKO single keys to Infisical dev.
  Verified live (budget-dev): Add → Equity → AAPL → Current price "298.26 USD" +
  "Last updated just now", no price-blocked banner, Save enabled. (Finnhub serves
  the equities; key confirmed working via direct quote = 298.63.)
  BUG FOUND + FIXED during this (see Gaps): empty-string *_API_KEYS placeholders in
  Infisical shadowed the populated *_API_KEY because boot used `??` (only catches
  null/undefined) → adapter got "" → every price came back price_unavailable.
  Fixed with resolveApiKey() (`||` semantics) in apps/api/boot.ts + apps/worker;
  unit-tested (price-provider.test, 4 cases). The fallback banner remains verified
  (Test 4) for genuinely-missing keys.

### 7. Type-first form + precious metals (9.1)

expected: Type is the first field; choosing a type swaps the fields — tracked
(Asset autocomplete filtered to the type), manual (name + editable price), precious
metals (metal/kind/UoM + spot-fetched price converted by UoM), cash (currency +
amount). Metals value = spot/oz converted to the chosen unit × quantity.
result: [pending]

## Summary

total: 7
passed: 5
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

# Found during Test-1 follow-up iteration (post-pass polish).

- truth: "Dragging the LAST item out of a group throws an error boundary (Something went wrong)."
  status: fixed
  reason: "A 'keep emptied group visible during drag' augmentation (drag-anchor snapshot + entries injection) crashed @dnd-kit when the active row's group emptied mid-drag."
  severity: major
  test: live render + investment-grouping 12/12 + investment vitest 39/39
  resolution: "Reverted the keep-group augmentation entirely (drag-anchor ref + handlers + entries injection). Render verified clean on live (no error boundary, console clean). Tradeoff: an emptied group again disappears mid-drag and reappears correctly on drop — pre-augmentation behavior."

- truth: "Dragging a whole GROUP block doesn't make the other items open space to preview the drop slot."
  status: deferred
  reason: "Group blocks use useDraggable (not useSortable) BY DESIGN — a group wraps its own sortable children, so it can't also be a sortable sibling (overlapping rects break collisionDetection). Naive live-move reflows the DOM under the pointer-delta transform → the group jumps. The drop still lands in the correct place; only the during-drag preview is missing."
  severity: minor (cosmetic; lands correctly)
  next: "Proper fix is a non-trivial rework (drop-indicator line, or restructuring the sortable model) that can't be verified headlessly (@dnd-kit pointer sensors are human-only) — awaiting owner steer before changing the confirmed-working DnD."

- truth: "A delisted row dims its content but its drag handle stays full opacity."
  status: fixed
  reason: "opacity-50 was on the whole row container; CSS parent-opacity caps children, so the injected drag handle dimmed too — violating 09-07-PLAN ('drag handle stays full opacity')."
  severity: minor
  test: investment-row.test (new: handle-not-in-any-opacity-50-ancestor while content + chip dim)
  resolution: "Moved opacity-50 off the row container onto the two content siblings (tap region + desktop actions); handle is a full-opacity sibling. 10/10."

- truth: "A delisted holding can be seen in the live app."
  status: deferred
  reason: "list-holdings.ts hardcodes isDelisted:false (comment: per-row delisted enrichment deferred to P07; surfaced via the INVESTMENT_INSTRUMENT_DELISTED task instead). No live data path → the delisted chrome is unit-proven only, not live-demoable."
  severity: minor (by-design deferral, not a regression)
  next: "Wire per-row delisted detection in P07; until then the chrome is covered by component tests."

- truth: "With a provider key set, a tracked instrument fetches a live price."
  status: fixed
  reason: "Empty-string *_API_KEYS placeholders in Infisical shadowed the populated single *_API_KEY: boot/worker used `KEYS ?? KEY` and `??` only coalesces null/undefined, so the adapter received \"\" and every price returned 422 price_unavailable — even though the keys were valid (Finnhub quote AAPL=298.63 directly)."
  severity: major (silently breaks all live pricing whenever the empty placeholder exists)
  test: packages/investments/test/ports/price-provider.test.ts (resolveApiKey: empty CSV → single key; 4 cases)
  artifacts:
  - path: apps/api/src/boot.ts
    issue: "TWELVE_DATA/FINNHUB/COINGECKO key = env.*_API_KEYS ?? env.*_API_KEY"
  - path: apps/worker/src/worker.ts
    issue: "same ?? pattern on process.env"
  resolution: "Added resolveApiKey(csv, single) = csv || single || \"\" in price-provider port; both boot + worker use it. Verified live: AAPL → 298.26 USD."

- truth: "After picking a search suggestion, the dropdown stays closed (reopens only on a new query)."
  status: fixed
  reason: "Selecting set the Asset name to the instrument's display name, which re-triggered the debounced search effect → the suggestion list flashed closed then reopened."
  severity: minor (UX)
  test: instrument-search-input.test (existing suite green); live (GOOG→Alphabet stays closed)
  resolution: "justSelectedRef in InstrumentSearchInput: set on select, cleared on a real keystroke; the search effect skips the reopen when it's set."

- truth: "Repeatedly checking the same instrument's price reuses a cached value instead of spending the shared provider quota."
  status: fixed
  reason: "fetchInstrumentPrice always called the provider (only WROTE the cache); repeated/again-by-another-user lookups each spent a request (capped only by 10/user/min)."
  severity: major (quota exhaustion risk on a shared free tier)
  test: packages/investments/test/application/fetch-instrument-price.test.ts (3 cases: fresh hit→no provider/no rate-limit, miss→fetch+cache, stale→refetch)
  resolution: "Read-through cache: serve a price fresh within 3h (CACHE_TTL_MS, aligned to the price-scan cron) with no provider call and no rate-limit charge. Verified live: GOOG re-fetch → 0 new rate-limit rows in the minute, price served from the 16-min-old cache."

# Open question (not a defect) — instrument universe coverage.
- truth: "Search returns any real stock/crypto the user types (e.g. META)."
  status: known-limitation
  reason: "Search is LOCAL over budgeting.instruments (D-04: never calls a provider, to protect quota). The universe is a HARDCODED DEFAULT_INVESTMENT_UNIVERSE (~21 rows, dev/UAT) seeded daily via runInstrumentsDailySeed(fetchUniverse). META/most symbols aren't seeded → 'nothing found'."
  severity: scope (product decision)
  next: "For full coverage, point fetchUniverse() at the providers' symbol lists (Finnhub /stock/symbol?exchange=US ≈ all US stocks; CoinGecko /coins/list ≈ all coins) and let the existing daily job upsert + delist-detect. Sizeable add; out of UAT scope."

# Found + fixed during pre-flight (not an open gap — recorded for traceability).

- truth: "After adding a holding, a reload still shows the holding (it persists)."
  status: fixed
  reason: "~50% flaky E2E; reload hydrated a stale-empty persisted RQ snapshot treated as fresh (staleTime:30s) so the row rendered empty despite GET 200 + DB row."
  severity: major
  test: pre-flight (add-custom-holding persistence guard)
  root_cause: "Optimistic create wrote to memory cache; the 800ms-debounced IDB persister hadn't flushed, so a reload restored the pre-add empty snapshot and SWR never revalidated it."
  artifacts:
  - path: "apps/web/src/lib/query-persist.ts"
    issue: "no immediate write-through; only an 800ms debounced persister"
  - path: "apps/web/src/hooks/use-create-holding.ts"
    issue: "optimistic create did not durably persist before a possible reload"
    missing:
  - "persistNow() write-through; called in onMutate (await) + onSettled"
    resolution: "Implemented write-through persist; re-measured 20/20 pass, 0 flaky."
