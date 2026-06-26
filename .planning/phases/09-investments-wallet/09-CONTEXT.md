# Phase 9: Investments Wallet - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A feature-flagged **Investments section** (the last section on the wallets page, hidden when `investments_enabled` is off) where a household tracks investment holdings — name, type, group, buy price/currency, quantity, current price. Current prices auto-fetch for held instruments via free-API price providers; each holding renders value, P/L %, and portfolio weight %; and a daily price + FX snapshot is persisted to reconstruct historical portfolio value for future charts (the charts themselves are NOT built this phase).

This discussion settled the HOW (storage shape, search architecture, the add/edit Sheet, row/group rendering, FX-history scope, and non-tradable/cash type behavior). The WHAT is locked by `09-SPEC.md` (16 requirements) **as amended** by this discussion.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**16 requirements are locked** (INV-01…INV-16). See `09-SPEC.md` for full requirements, boundaries, and acceptance criteria — **including the `## Amendments (discuss-phase, 2026-06-20)` block at the top, which is authoritative where it conflicts with the original prose.**

Downstream agents MUST read `09-SPEC.md` (amendments included) before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md, as amended):**

- `investments_enabled` per-budget flag — Settings toggle + onboarding wizard features step + `GET /budgets/:id` DTO + conditional section render (mirrors `reserves_enabled`).
- Investments section as the **last** section on the wallets page.
- Holding record + CRUD via a right-side `Sheet` (no inline edit), full field set (name, type, group, buy price/currency, quantity, current price, instrument ref).
- Locked 9-value Type enum; free-text Group with existing-group autocomplete.
- Debounced (2s / blur) instrument search across equities/ETF/FX/crypto/precious-metals **+ plain currencies as cash**; suggestion select (preselect type + prefill live price) or "custom".
- Current-price → buy-currency conversion; per-holding value / P/L % / weight %; grouped rendering with group-% of total; budget-default-currency weight denominator.
- DnD: reorder within section, group reassignment in/out, whole-group reorder; cross-wallet-section drop rejected.
- `PriceProvider` port + free-API adapter(s) + price-cache table; hourly held-only fetch; instant rate-limited (10/user/min) on-add fetch.
- Daily snapshot of instrument last price + FX rates (extend the existing daily-FX job) — history rows only.
- React-Query client caching with optimistic create/edit/reorder.
- **(A1) `INVESTMENT_INSTRUMENT_DELISTED` Task type** — one new Tasks-queue type (reuses Phase 7 subsystem).
- **(A3) Cash-balance holdings** — value-only currency holdings.

**Out of scope (from SPEC.md, as amended):**

- Charts / capitalization graphs / time-series viz — deferred; this phase only PERSISTS the snapshot data.
- Investment buy/sell ledger, tax lots, dividends, fees, multi-buy cost-basis averaging — single buy price per holding.
- Real-time / streaming / sub-hourly price updates — hourly cron + on-add fetch only.
- Paid / API-key-gated premium price tiers — free APIs only.
- Brokerage / open-banking sync or auto-updating quantity — manual entry only.
- Other investment Tasks-queue kinds, alerts, or banners (only `INVESTMENT_INSTRUMENT_DELISTED` is in scope per A1).
- **(A2) No "pending" / "stale" price states** — price required to save; block-on-no-price.
- **(A3) Traded forex positions** (currency pairs with P/L) — deferred; cash balances only this phase.
- PL/UK translation-quality review — keys added, copy quality not gated.

</spec_lock>

<decisions>
## Implementation Decisions

### Holdings storage

- **D-01 (storage shape):** New dedicated **`investments` table**. Wallets stay untouched 3-field manual-balance snapshots; holdings' richer field set + price logic do NOT bloat wallet queries or the wallet reorder path. The Investments "section" is a **UI render only** — `INVESTMENTS` does NOT join the `wallet_type` enum.
- **D-02 (instrument identity):** A shared **`instruments` reference table** (`id, provider, symbol, asset_class, display_name`, active/delisted flag). Holdings FK to `instrument_id` (**null = custom/untracked**). The price-cache and daily snapshot key on `instrument_id`; the hourly cron = `SELECT DISTINCT instrument_id FROM investments`. Reference data (no `tenant_id`); also backs the search index.
- **D-03 (delete):** **Soft-archive, no in-app restore** — mirror Phase 5 wallets exactly (`archived_at`, hidden from section + weight math, admin/DB-only recovery, "can't be undone here" confirm). Instrument-level price/FX history survives regardless (keyed on `instrument_id`).

### Search source

- **D-04 (resolution):** Search hits a **pure local pre-seeded `instruments` index** (Postgres) — it **never** calls a provider, so it's very fast and works offline-read. A provider is called **only on a price-miss** (on-add instant fetch + hourly cron); a cached price means no call. Not-in-list → the user picks **"custom"**.
- **D-05 (universe breadth):** **Major markets only** — US + major EU exchanges, top crypto by market cap, precious-metal (gold/silver) coins, **plus plain currencies (cash)**. Long-tail/exotic listings are excluded from search (still enterable as custom). (This refined the user's initial "all" once the free-tier ceiling was surfaced.)
- **D-06 (refresh cadence):** A **daily** reference-data pg-boss job (mirrors the `fx-daily-fetch` cron, reference-data scope, no per-tenant iteration) upserts new listings and flags delistings.
- **D-07 (match + rank):** Match on **symbol prefix + display-name substring**; rank exact-symbol > symbol-prefix > name-match; cap ~10–20 rows; trigram index. Min-char threshold ≥ 2 (Claude discretion).
- **D-08 (suggestion row):** Each suggestion shows **symbol + name + asset-class chip** (Equity/ETF/Crypto/FX/Metal); exchange/quote-ccy appended only to break ties; selecting a row **auto-fills `type`** from the chip.
- **D-09 (delisting):** A held instrument gone from the daily feed → flag it inactive/delisted in `instruments`, **keep the holding**, freeze last price, stop the cron fetching it, render the **delisted label + dimmed row**, AND emit the new task (see D-10).
- **D-10 (new Task type — SCOPE ADDITION, amends SPEC A1):** `INVESTMENT_INSTRUMENT_DELISTED`. Trigger = daily refresh detects a held instrument inactive. Granularity = **one task per affected holding** ("Review {name} — instrument delisted, price frozen"). Resolves when the user archives the holding or switches it to custom. Reuses the existing Phase 7 Tasks subsystem — **new type only**, no new Tasks infrastructure.

### Sheet form UX

- **D-11 (spine):** **Single scrolling form** (matches `category-form-sheet`). Search-driven name field at top; selecting an instrument autofills type + current price + its currency inline; group, buy price/currency, quantity follow. "Custom" is the same form with nothing autofilled.
- **D-12 (price editability):** **Tracked = read-only** current price (live value + "last updated" hint, the cron owns it). **Custom = editable** manual price.
- **D-13 (currency model):** **Buy currency defaults to the instrument's quote currency** (editable). The **current price is ALWAYS shown in the buy currency** — the native price is FX-converted (`FxProvider.rateAsOf` + `Money`). Each holding is **single-currency in the UI** (price, value, P/L all in buy ccy). Under the hood the **native price + FX rate are still captured** (daily snapshot, per INV-15). **Weights** use the **budget default currency** denominator (INV-10, unchanged).
- **D-14 (required fields):** name, type, quantity, buy price, current price (**group optional**). Custom: current price **prefills to the buy price** (P/L starts at 0%, never blank), editable. Tracked: current price = live, read-only. **Cash exception (D-20):** amount + currency only (no buy/current price, no P/L).
- **D-15 (quantity):** **Fractional / crypto-grade** precision via big.js. Numeric inputs accept **comma AND dot** decimal separators (PL/UK) — apply to ALL investment numeric fields; reuse/extend the existing amount-input component.
- **D-16 (type picker):** **Dropdown with a lucide icon + translated label** per 9-enum value; preselected from the suggestion's class-chip for tracked, but **editable** (reclassifiable).
- **D-17 (group field):** **Combobox** — filters the budget's existing group names + free-type a new name to create it on save.
- **D-18 (save/close):** **Optimistic (instant) save** via `clientApiWrite` (Sheet closes immediately, list updates, toast/rollback per INV-16); **discard-confirm** on dirty close (a clean form closes silently).
- **D-19 (delete / row actions):** Delete (soft-archive) lives in the **Sheet footer** (with confirm) AND as **row actions**: desktop hover reveals **trash + pen** icons; mobile **swipe-left** reveals **Edit + Delete**. Pen/Edit opens the Sheet. **Reuse the existing swipe-to-reveal primitive** (`wallet-row.tsx`, currently Delete-only) and extend it to Edit + Delete. Row data stays read-only (INV-06 holds).

### Row & group render

- **D-21 (row layout):** **Same style as wallets.** Desktop = single line, all fields (name · currency · value · P/L % · weight %). Mobile = compact row (**name + currency + value only**); **tap expands** to reveal P/L % + weight % (+ delisted/last-updated); swipe-left stays the Edit/Delete gesture (distinct from tap).
- **D-22 (P/L color):** **Green up / red down** using the existing success/destructive tokens + a +/− sign (optional ▲/▼). Documented **exception to single-yellow** (P/L is semantic data, not a CTA accent).
- **D-23 (weight render):** **Plain number** (consistent with the Reserves share column + minimal wallets style).
- **D-24 (group headers):** **Collapsible** group headers showing group name + **group-% of total investments**; collapsed/expanded state persisted client-side per budget (default expanded). Ungrouped holdings render **flat + always visible**. (A deliberate step beyond Phase 5's non-collapsible sections.)
- **D-25 (price state chrome — amends SPEC A2):** **No "pending", no "stale".** A current price is **required to save**; the rare no-price case (rate limit / fetch fail / uncached) **blocks the save** with a "try again in a moment" message (never saved as pending). Rows always show the latest cached price. The **ONLY** price-state chrome is **delisted** — a "delisted" label + a slightly transparent/dimmed row.
- **D-26 (empty / add):** **Header + dashed "+ Add investment"** (reuse `DashedAddButton`, NOT yellow), **no helper copy** — empty or not, the dashed button at the section bottom opens the Sheet. Wallets/categories-consistent.
- **D-27 (sort order):** **Manual drag order only** (persisted `sort_order`); new holdings append to the end of their group; no column sorting. Consistent with INV-11 + wallets/reserves.
- **D-28 (number formatting):** **Same rules as other wallet types** — reuse the existing `Money` / `Intl.NumberFormat` helpers + locale rules; full values (no abbreviation); P/L % + weight % follow the same locale separators.
- **D-29 (drag-drop — INV-11):** Reuse the wallets `<RowDragHandle>` + `@dnd-kit` cross-section context. Reorder within section, group reassignment (drag into a group sets it; out clears/changes it), whole-group reorder; cross-wallet-section drop **rejected** (mirrors `wallet_id_not_in_section`). **Flag for planner:** three gestures coexist on a mobile row (tap-expand / swipe-actions / long-press-drag) — disambiguate via the `@dnd-kit` PointerSensor activation delay (Phase 5 used `{delay: 300, tolerance: 5}`).

### FX-history scope

- **D-30 (daily snapshot — INV-15):** The **goal** (user-stated) is to retain enough daily price + FX history to **reconstruct the portfolio's value in budget currency for any past day** (future charts/stats). **Mechanism:** a **base-anchored daily snapshot** — each in-use currency vs one anchor base (EUR, matching Frankfurter/ECB + the existing `budgeting.fx_rates`), plus each held instrument's daily last price. Any day / any-currency value is reconstructable via cross-rate without storing a redundant pairwise matrix. Extends the existing `fx-daily-fetch` pair collection; append-only history.

### Non-tradable & cash types

- **D-31 (cash balances — amends SPEC A3):** Cash (type `cash_fx`) = **amount + currency, value-only — no buy/current price, no P/L.** Counted toward portfolio value/weight (FX-converted to budget default ccy). The Sheet **simplifies to amount + currency (+ group)** for cash. Plain currencies appear in the search list. **Traded forex positions are deferred** (see Deferred Ideas).
- **D-32 (custom-only types):** `real_estate` and `other` never match a tracked instrument → **always the custom path** (manual buy + current price → **manual P/L**); **quantity defaults to 1** (value = current price). Uniform form. Generalizing: **tracked-vs-custom is determined by whether an instrument was linked, independent of type** — except cash (always value-only) and real_estate (always custom).

### Claude's Discretion

- **Global totals integration** (user skipped this gray area): investments stay **section-only this phase** — no leak into Home/BDP shell pills or a household net-worth total, consistent with charts/aggregates being deferred.
- **Section identity** (user skipped): title "Investments"; a not-yet-used lucide icon (`TrendingUp` or `ChartCandlestick` — `Coins`=Reserves, `Wallet`=Wallets are taken); i18n namespace `budget.investments.*` across EN/PL/UK.
- **Search min-char threshold** ≥ 2.
- **Collapsed-group state** persisted client-side per budget (localStorage), default expanded.
- **Concrete free-API vendor selection** + their published rate limits + which feeds back the `instruments` seed and price cache — left to **plan-phase research** (SPEC fixes "free" + coverage, not the vendor).
- **Rate-limit enforcement point** (middleware vs repo) and exact price-cache/snapshot table columns — planner/executor.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec & roadmap (read first)

- `.planning/phases/09-investments-wallet/09-SPEC.md` — **locked requirements INV-01…INV-16 + the authoritative `## Amendments (discuss-phase, 2026-06-20)` block (A1 delisted Task, A2 price model, A3 cash/forex).** MUST read before planning.
- `.planning/ROADMAP.md` §Phase 9 (lines ~234–245) — goal, dependencies (Phase 5, Phase 6), success criteria.

### Design authority

- `DESIGN.md` — Binance dark canvas, single yellow accent (P/L green/red is the documented exception), Inter + IBM Plex Sans; dashed +Add buttons NOT yellow; success/destructive tokens.
- `/home/claude/budget/CLAUDE.md` — TDD-first (no DB mocks), hexagonal per context, `Money` at adapter boundary, RLS + tenant_id, DESIGN.md authority, impeccable sweep before close, Docker-on for verification, latest-stable deps.

### Prior-phase carry-forward (locked patterns this phase reuses)

- `.planning/phases/05-reserves-wallets-tabs/05-CONTEXT.md` — sectioned wallets, `@dnd-kit` cross-section DnD, `<RowDragHandle>` / `<DashedAddButton>` atoms, soft-archive-no-restore, TanStack Query optimistic pattern, RSC-shell+client-island (note: BDP tabs since evolved to a client pushState carousel — verify live).
- `.planning/phases/07-tasks-queue/07-CONTEXT.md` — Tasks subsystem the new `INVESTMENT_INSTRUMENT_DELISTED` type plugs into (pg-boss generators, task kinds).

### Codebase anchors (from SPEC scout + this discussion)

- `packages/tenancy/src/adapters/persistence/schema.ts:37-48` — `reserves_enabled`/`cushion_enabled` boolean flags; add `investments_enabled` here.
- `packages/budgeting/src/domain/wallet.ts:12` + `…/wallets-schema.ts:25,40` — `walletType` enum (`INVESTMENTS` does NOT join it — D-01).
- `apps/api/src/routes/wallets.ts:209-248` — reorder route + `wallet_id_not_in_section` cross-section-reject guard to mirror (D-29).
- `apps/web/src/components/settings/cushion-section.tsx` + `apps/web/src/components/onboarding/steps/step-features.tsx` — flag-toggle precedent (Switch / FeatureRow) for `investments_enabled`.
- `apps/web/src/components/budgeting/category-form-sheet.tsx` / `category-row-sheet.tsx` — the side-Sheet pattern to reuse (D-11).
- `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx` — **swipe-to-reveal row primitive to reuse + extend to Edit+Delete (D-19)**; also `transaction-row.tsx`, `reserves-table-row.tsx`.
- `apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx` / `wallet-section.tsx` / `wallet-delete-confirm.tsx` — section render + DnD context + delete-confirm to follow.
- `apps/web/src/lib/offline-write.ts` (`clientApiWrite`) + `query-provider.tsx` — optimistic mutation + IndexedDB-persisted React-Query cache (`["budget", id, "investments"]`, D-18/INV-16).
- `packages/shared-kernel/src/money.ts` (`Money`, big.js) + `budgeting.fx_rates` + `fx-daily-fetch` cron + `FxProvider.rateAsOf` — FX/conversion to reuse (D-13, D-30); **no new FX table/job**, only added pairs.
- `apps/worker/src/worker.ts` — pg-boss `createQueue`→`schedule`→`registerXHandler`; where the new hourly price job + daily seed/snapshot jobs register (reference-data, `withInfraTx`, no per-tenant iteration).
- **Greenfield (must build):** `PriceProvider` port + free-API adapter(s), `instruments` table + daily seed job, price-cache table, daily price snapshot, hourly held-only fetch job, `investments` table + repo + domain entity + routes + Zod contracts + i18n keys.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Side `Sheet`** (`category-form-sheet`/`category-row-sheet`) — the add/edit Sheet pattern (D-11).
- **Swipe-to-reveal row** (`wallet-row.tsx`) — mobile left-swipe actions; extend Delete-only → Edit+Delete (D-19).
- **`<RowDragHandle>` + `@dnd-kit`** cross-section DnD; **`<DashedAddButton>`** (+Add per section); section header styling — all from the wallets tab (D-26, D-29).
- **`clientApiWrite`** + React-Query per-budget cache — optimistic create/edit/reorder, offline toast/rollback (D-18).
- **`Money` + `FxProvider` + `budgeting.fx_rates` + `fx-daily-fetch`** — conversion + daily FX persistence already running (D-13, D-30).
- **Amount/numeric input component** — extend for comma+dot decimals + crypto-grade precision (D-15).
- **Flag toggle** (`Switch` in settings + `FeatureRow` in onboarding) — `reserves_enabled` cascade is the exact template for `investments_enabled`.

### Established Patterns

- Per-budget React-Query keys `["budget", id, "<tab>"]` with optimistic `onMutate`/`onError`/`onSettled`.
- Soft-archive-no-restore for deletable records (wallets).
- Reference-data pg-boss jobs: `withInfraTx`, no per-tenant iteration (the FX daily job is the template for the seed/snapshot/price jobs).
- Hexagonal discipline: Drizzle only in `adapters/persistence/`; domain entities plain classes; `Money` at the adapter boundary; RLS + `tenant_id` on holding tables; reference tables (instruments/price-cache/snapshot/FX) carry no `tenant_id`.

### Integration Points

- New `investments` table + `GET/POST/PATCH/POST-archive /investments` (or nested under budget) + reorder route mirroring the wallet cross-section-reject guard.
- `investments_enabled` added to `tenancy.budgets` + surfaced in the `GET /budgets/:id` DTO + Settings + onboarding wizard.
- Investments section rendered as the last section inside the wallets tab client island.
- New hourly price-fetch job + daily instruments-seed job + daily price/FX snapshot job registered in `apps/worker`.
- `INVESTMENT_INSTRUMENT_DELISTED` emitted into the Phase 7 Tasks queue from the daily refresh.

</code_context>

<specifics>
## Specific Ideas

- **"Same style as wallets"** is the recurring directive — rows, number formatting, swipe actions, dashed +Add, soft-archive all mirror the wallets tab. Divergences are deliberate and few: Sheet-only editing (no inline), collapsible groups, P/L green/red, mobile tap-to-expand for the extra metrics.
- **Per-holding single-currency view** — everything for a holding reads in its **buy currency** (native price FX-converted); only the portfolio weight denominator is the budget default currency.
- **Search is 100% local + instant** — the provider is for prices only, never for search; the user picks from a pre-seeded major-markets universe or enters custom.
- **No pending/stale noise** — the user explicitly wants a price required at save and only a **delisted** state (label + dimmed row); the rare no-price case blocks the save rather than creating a pending holding.
- **Cash ≠ FX** — a broker cash balance is value-only (no P/L); traded forex positions are a separate, deferred concept.
- **Delisted is visible two ways** — dimmed/labeled row AND a per-holding Task (`INVESTMENT_INSTRUMENT_DELISTED`).

</specifics>

<deferred>
## Deferred Ideas

- **Traded forex positions** — currency pairs with buy/current rate + P/L. Explicitly deferred to a future phase; this phase ships cash balances (value-only) only.
- **Capitalization / value charts + time-series** — SPEC out-of-scope; this phase only persists the daily price+FX snapshot the charts will consume.
- **Global net-worth / portfolio total on Home/BDP shell** — section-only this phase; surfacing an app-wide investments total is a later concern.
- **Investment buy/sell ledger, tax lots, dividends, fees, cost-basis averaging** — single buy price per holding (SPEC out-of-scope).
- **Brokerage / open-banking sync, auto-updating quantity, sub-hourly/streaming prices, paid price tiers** — SPEC out-of-scope.
- **Manual price override for tracked instruments** (override-lock) — not this phase (tracked price is cron-owned, read-only).

### Reviewed Todos (not folded)

None — no pending todos matched Phase 9 scope (`todo.match-phase` returned 0 matches).

</deferred>

---

_Phase: 9-Investments Wallet_
_Context gathered: 2026-06-20_
