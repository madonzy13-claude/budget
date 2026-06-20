# Phase 9: Investments Wallet - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 09-investments-wallet
**Areas discussed:** Holdings storage, Search source, Sheet form UX, Row & group render, FX snapshot pair scope, Non-tradable types

---

## Holdings storage

| Option                              | Description                                            | Selected |
| ----------------------------------- | ------------------------------------------------------ | -------- |
| New `investments` table             | Dedicated table; wallets untouched; section is UI-only | ✓        |
| Extend `wallets` + INVESTMENTS type | One table, nullable holding columns, filter everywhere |          |
| You decide                          | —                                                      |          |

**User's choice:** New `investments` table.

| Option                          | Description                                                     | Selected |
| ------------------------------- | --------------------------------------------------------------- | -------- |
| Shared `instruments` table      | Canonical ref table; holdings FK; cache/snapshot/cron key on it | ✓        |
| Denormalized (provider, symbol) | Inline on holding; no shared row                                |          |
| You decide                      | —                                                               |          |

**User's choice:** Shared `instruments` reference table.

| Option                    | Description            | Selected |
| ------------------------- | ---------------------- | -------- |
| Soft-archive, no restore  | Mirror Phase 5 wallets | ✓        |
| Hard delete               | Row removed            |          |
| Soft-archive + restore UI | Adds restore surface   |          |

**User's choice:** Soft-archive, no restore.

---

## Search source

| Option                        | Description                        | Selected    |
| ----------------------------- | ---------------------------------- | ----------- |
| Hybrid: local + live fallback | Local FTS, live fallback when thin |             |
| Local cached index only       | Pure local index, never provider   | ✓ (refined) |
| Live provider passthrough     | Provider on each pause             |             |

**User's choice (free text):** "Provider should be called only if instrument price isn't [in] our database… offline mode is read only… User can select only from list of instruments that we fetched earlier and that should be a full list of all stocks, crypto and golden coins… suggestion must be very fast."
**Notes:** = local index only, comprehensive pre-seed, provider for price-miss only, fast.

| Option                   | Description                         | Selected |
| ------------------------ | ----------------------------------- | -------- |
| Daily reference-data job | Mirrors fx-daily-fetch              | ✓        |
| Weekly refresh           | Lighter, slower to pick up listings |          |
| Manual / on-deploy seed  | No recurring job                    |          |

**User's choice:** Daily reference-data job.

| Option                            | Description               | Selected |
| --------------------------------- | ------------------------- | -------- |
| Symbol + name, symbol-exact first | Forgiving match + ranking | ✓        |
| Symbol/ticker only                | Exact ticker required     |          |
| Fuzzy on symbol + name            | Typo-tolerant             |          |

**User's choice:** Symbol + name, symbol-exact first.

| Option                      | Description                    | Selected |
| --------------------------- | ------------------------------ | -------- |
| Symbol · name · class badge | + exchange/quote to break ties | ✓        |
| Symbol · name only          | Minimal                        |          |
| Full context every row      | Densest                        |          |

**User's choice:** Symbol · name · class badge.

| Option                       | Description                              | Selected |
| ---------------------------- | ---------------------------------------- | -------- |
| Broadest the free APIs allow | Every listable instrument                |          |
| Major markets only           | US + major EU + top crypto + metal coins | ✓        |
| You decide                   | —                                        |          |

**User's choice:** Major markets only.
**Notes:** Refined the earlier "all stocks" once the free-tier ceiling was surfaced.

| Option                   | Description                                       | Selected  |
| ------------------------ | ------------------------------------------------- | --------- |
| Flag stale, keep holding | Inactive flag, freeze price, stop cron, indicator | ✓ (+task) |
| Sever → becomes custom   | Null instrument_id                                |           |
| You decide               | —                                                 |           |

**User's choice (free text):** "Flag stale, keep holding, also add task so user can see it clearly."
**Notes:** User directed a new Task type (scope addition). See below.

| Option                        | Description                                      | Selected |
| ----------------------------- | ------------------------------------------------ | -------- |
| Delisted, one per holding     | Per affected holding, resolves on archive/custom | ✓        |
| Delisted + stale, per holding | Adds staleness threshold                         |          |
| One summary task per budget   | Single rollup task                               |          |

**User's choice:** Delisted, one per holding (`INVESTMENT_INSTRUMENT_DELISTED`).
**Notes:** User overrode the SPEC out-of-scope "Tasks untouched" line — "We already have task feature, you should only add a new task type." Recorded as SPEC Amendment A1.

---

## Sheet form UX

| Option                        | Description                       | Selected |
| ----------------------------- | --------------------------------- | -------- |
| Single scrolling form         | Search at top, autofill on select | ✓        |
| Two-step: identify → position | Wizard                            |          |
| You decide                    | —                                 |          |

**User's choice:** Single scrolling form.

| Option                               | Description             | Selected |
| ------------------------------------ | ----------------------- | -------- |
| Tracked = read-only; custom = manual | Cron owns tracked price | ✓        |
| Always editable (override)           | Cron overwrites         |          |
| You decide                           | —                       |          |

**User's choice:** Tracked read-only, custom manual.

| Option                                 | Description                 | Selected |
| -------------------------------------- | --------------------------- | -------- |
| Combobox: filter existing + create new | One control                 | ✓        |
| Native datalist                        | Light, inconsistent styling |          |
| Select existing + 'New group'          | Two interactions            |          |

**User's choice:** Combobox.

| Option                                                    | Description | Selected    |
| --------------------------------------------------------- | ----------- | ----------- |
| Buy = budget default (editable); price ccy = instrument's | —           |             |
| Buy = instrument's quote (editable)                       | —           | ✓ (refined) |
| You decide                                                | —           |             |

**User's choice (free text):** "Buy is in currency of instrument (editable)… actual price is always in currency of selected buy currency."
**Notes:** Buy ccy defaults to instrument quote (editable); current price always shown in buy ccy (native FX-converted); per-holding single-currency UI; weights still in budget default ccy.

| Option                                   | Description                       | Selected    |
| ---------------------------------------- | --------------------------------- | ----------- |
| Name + type + qty + buy price            | Current price optional for custom |             |
| All fields required (incl current price) | —                                 | ✓ (refined) |
| Only name required                       | Stub                              |             |

**User's choice (free text):** "Name, type, qty, buy price, actual price. Also, if custom is selected, mirror buy price to actual price, but allow to change actual price."
**Notes:** Current price required; custom prefills actual=buy price, editable.

| Option                    | Description      | Selected   |
| ------------------------- | ---------------- | ---------- |
| Fractional / crypto-grade | big.js precision | ✓ (+comma) |
| Whole + 2 decimals        | Breaks crypto    |            |
| You decide                | —                |            |

**User's choice (free text):** "Fractional, crypto grade. Make sure that field also accepts comma, not just dot."
**Notes:** Comma+dot decimal input across all numeric fields (PL/UK).

| Option                           | Description                           | Selected |
| -------------------------------- | ------------------------------------- | -------- |
| Dropdown: icon + label, editable | Preselected from chip, reclassifiable | ✓        |
| Grid of type chips               | 9 tiles                               |          |
| You decide                       | —                                     |          |

**User's choice:** Dropdown icon + label, editable.

| Option                                | Description              | Selected |
| ------------------------------------- | ------------------------ | -------- |
| Instant save + warn before discarding | Optimistic + dirty-guard | ✓        |
| Instant save, close without warning   | No guard                 |          |
| You decide                            | —                        |          |

**User's choice:** Instant save + warn before discarding (re-explained without jargon after user asked).

| Option                         | Description  | Selected    |
| ------------------------------ | ------------ | ----------- |
| Delete button inside the Sheet | Clean rows   |             |
| Row trash on hover/tap         | Quick delete |             |
| Both                           | Sheet + row  | ✓ (refined) |

**User's choice (free text):** "Inside the sheet and also same as in wallets, if mobile - slider left uncovers delete and edit buttons, desktop - on hover trash and pen icons."
**Notes:** User confirmed wallets already use mobile swipe-to-reveal — so it's a reuse (extend Delete-only → Edit+Delete), not net-new. Primitive at `wallet-row.tsx`.

---

## Row & group render

| Option              | Description           | Selected |
| ------------------- | --------------------- | -------- |
| Two-line row        | Name+badges / numbers |          |
| Single-line columns | Table-style           |          |
| You decide          | —                     |          |

**User's choice (free text):** "Same style as wallets. Desktop - single line, mobile show just name, currency and amount and all other info revealed by row tap."
**Notes:** Mobile tap-to-expand for P/L%+weight%; swipe stays Edit/Delete.

| Option              | Description                         | Selected |
| ------------------- | ----------------------------------- | -------- |
| Green up / red down | Semantic success/destructive tokens | ✓        |
| Sign only, neutral  | Single-yellow purity                |          |
| You decide          | —                                   |          |

**User's choice:** Green up / red down.

| Option            | Description                 | Selected |
| ----------------- | --------------------------- | -------- |
| Plain number      | Wallets/reserves-consistent | ✓        |
| Number + mini bar | Visual proportion           |          |
| You decide        | —                           |          |

**User's choice:** Plain number.

| Option                        | Description            | Selected |
| ----------------------------- | ---------------------- | -------- |
| Static header: name + group-% | Non-collapsible        |          |
| Collapsible groups            | Tap to collapse/expand | ✓        |
| You decide                    | —                      |          |

**User's choice:** Collapsible groups.
**Notes:** Persist open/closed per budget, default expanded; ungrouped flat.

| Option              | Description                | Selected |
| ------------------- | -------------------------- | -------- |
| Badge + muted value | pending pill / stale badge |          |
| Icon + tooltip only | clock/warning icon         |          |
| You decide          | —                          |          |

**User's choice (free text):** "You cannot save item if you don't have price… no pending status… no stale status, just show latest price… The only label you can use is delisted (make that row a bit transparent)."
**Notes:** Asked for definitions of pending/stale first. Result: price required to save, no pending/no stale, delisted-only chrome (label + dimmed row). Recorded as SPEC Amendment A2.

| Option                          | Description            | Selected |
| ------------------------------- | ---------------------- | -------- |
| Block save, ask to retry        | No price-less holdings | ✓        |
| Let them enter it manually      | Manual fallback        |          |
| Keep SPEC R14 (save as pending) | Original               |          |

**User's choice:** Block save, ask to retry (the rare no-price edge).

| Option                            | Description          | Selected |
| --------------------------------- | -------------------- | -------- |
| Header + dashed '+ Add' (no copy) | Wallets-consistent   | ✓        |
| Header + helper copy + Add        | Friendlier first-run |          |
| You decide                        | —                    |          |

**User's choice:** Header + dashed '+ Add', no copy.

| Option                            | Description          | Selected |
| --------------------------------- | -------------------- | -------- |
| Manual drag order only            | Persisted sort_order | ✓        |
| Manual + tap-to-sort by value/P-L | Mode toggle          |          |
| You decide                        | —                    |          |

**User's choice:** Manual drag order only.

| Option                       | Description                    | Selected |
| ---------------------------- | ------------------------------ | -------- |
| Locale-aware standard        | Intl.NumberFormat, full values | ✓        |
| Locale-aware + compact large | €12.3k abbreviations           |          |
| You decide                   | —                              |          |

**User's choice (free text):** "Same rules as for other wallets types."
**Notes:** Reuse existing Money/Intl.NumberFormat helpers + locale rules.

---

## FX snapshot pair scope

| Option                           | Description                   | Selected     |
| -------------------------------- | ----------------------------- | ------------ |
| Each in-use currency vs one base | Compact, cross-rate derivable | ✓ (per goal) |
| Only pairs held holdings need    | Leanest, historical gaps      |              |
| Full pairwise matrix             | Most rows                     |              |

**User's choice (free text):** "I meant that you just should have history, so you can reproduce the budget value in future for particular day for charts… Forex currency should be available in list of investments, but in that list should also be just normal currencies that can be used as cash waiting for investment."
**Notes:** Goal = reconstructable per-day portfolio value (budget ccy). Mechanism = base-anchored daily snapshot. Also raised cash-in-list (next area).

---

## Non-tradable types

| Option                                     | Description                  | Selected    |
| ------------------------------------------ | ---------------------------- | ----------- |
| Units of a currency, valued via live FX    | Cash = FX exposure (uniform) |             |
| Plain cash (no P/L) + separate forex pairs | Two behaviors                | ✓ (refined) |
| You decide                                 | —                            |             |

**User's choice (free text):** "No, holding currency in broker account doesn't mean holding FX, those are separate things. You can have just cash balances in broker account without FX position."
**Notes:** Corrected the uniform model — cash balance ≠ FX position.

| Option                                 | Description                  | Selected |
| -------------------------------------- | ---------------------------- | -------- |
| Cash = value-only; forex = tracked P/L | Both, distinct               |          |
| Cash only this phase; defer forex      | Value-only cash; forex later | ✓        |
| You decide                             | —                            |          |

**User's choice:** Cash only this phase; defer forex. (SPEC Amendment A3.)

| Option                                     | Description       | Selected |
| ------------------------------------------ | ----------------- | -------- |
| Custom-only, manual P/L, qty defaults to 1 | Uniform form      | ✓        |
| Type-adaptive: hide quantity               | Per-type variants |          |
| You decide                                 | —                 |          |

**User's choice:** Custom-only, manual P/L, qty defaults to 1 (real_estate/other).

---

## Claude's Discretion

- **Global totals integration** (user skipped the gray area) — investments section-only this phase, no Home/net-worth leak.
- **Section identity** (user skipped) — title "Investments", a not-yet-used lucide icon, namespace `budget.investments.*` (EN/PL/UK).
- **Search min-char threshold** ≥ 2.
- **Collapsed-group state** persisted client-side per budget, default expanded.
- **Free-API vendor selection + rate limits** — plan-phase research.
- **Rate-limit enforcement point**, exact price-cache/snapshot columns — planner/executor.

## Deferred Ideas

- Traded forex positions (currency pairs with P/L) — future phase.
- Capitalization/value charts + time-series — future phase (this phase persists snapshot data only).
- Global net-worth / portfolio total on Home/BDP shell — future phase.
- Buy/sell ledger, tax lots, dividends, fees, cost-basis averaging; brokerage sync; sub-hourly/streaming prices; paid tiers — SPEC out-of-scope.
- Manual price override for tracked instruments — not this phase.
