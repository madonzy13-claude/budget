# Phase 9: Investments Wallet — Specification

**Created:** 2026-06-20
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 16 locked

## Goal

A budget with the `investments_enabled` flag on shows an **Investments section** as the last section of the wallets page, where a household tracks investment holdings (name, type, group, buy price/currency, quantity, current price); current prices are auto-fetched for held instruments via free-API price providers; each holding renders its value, profit/loss %, and portfolio weight; and a daily price + FX snapshot is persisted to seed future capitalization charts (the charts themselves are not built in this phase).

## Background

Grounded in the current codebase (scouted 2026-06-20):

- **Feature flags** are plain `boolean` columns on `tenancy.budgets` (`cushion_mode_enabled`, `reserves_enabled`, `cushion_enabled` — `packages/tenancy/src/adapters/persistence/schema.ts:37-48`). The Settings UI toggles them via a `Switch` → `PATCH /budgets/:id` → React-Query invalidate (`apps/web/src/components/settings/cushion-section.tsx`). The onboarding **wizard features step** toggles them via `FeatureRow` components (`apps/web/src/components/onboarding/steps/step-features.tsx`). `reserves_enabled` already cascades to hide the Reserves tab — the exact pattern `investments_enabled` will follow.
- **Wallets page** renders sections by filtering wallet rows on `walletType` (`SPENDINGS | CUSHION | RESERVE` — `packages/budgeting/src/domain/wallet.ts:12`; text column + CHECK in `wallets-schema.ts:25,40`). `WalletsSectionedList` owns a `@dnd-kit` `DndContext`; `POST /wallets/reorder {walletType, orderedIds}` persists `sort_order` and already **rejects** IDs not in the target section (`wallet_id_not_in_section`, `apps/api/src/routes/wallets.ts:209-248`). Wallet rows are manual-balance snapshots (no ledger drives them). An investment holding carries far more fields than a wallet row, so holdings are a **distinct record type** rendered in their own section — the precise persistence shape (new `investments` table vs. extending `wallets`) and whether `INVESTMENTS` joins the `wallet_type` enum are HOW decisions for discuss-phase.
- **Editing pattern** to reuse: the category edit **side `Sheet`** (shadcn `Sheet side="right"`, `category-form-sheet.tsx` / `category-row-sheet.tsx`) submitting through `clientApiWrite()`.
- **Client caching**: React Query (`query-provider.tsx`, persisted to IndexedDB) with per-budget keys like `["budget", id, "wallets"]`; mutations do optimistic `onMutate` / rollback `onError` / invalidate `onSettled` via `clientApiWrite()` (`lib/offline-write.ts`).
- **FX daily persistence ALREADY EXISTS**: `budgeting.fx_rates` (PK `base, quote, date`) populated by the `fx-daily-fetch` pg-boss cron (`0 17 * * *` Europe/Berlin), read via `FxProvider.rateAsOf(from,to,date)`. The `Money` value object (big.js, `packages/shared-kernel/src/money.ts`) does currency-safe arithmetic; conversion = `Money.of(amount.times(rate), targetCurrency)`. **No new FX table/job is needed** — only the addition of investment-relevant currency pairs to the daily fetch.
- **Price providers are GREENFIELD**: no `PriceProvider` port, no Twelve Data / CoinGecko / metals.dev adapter, no price table, no investments domain package. All of it must be built. pg-boss jobs register in `apps/worker/src/worker.ts` (`createQueue` → `schedule` → `registerXHandler`), reference-data jobs use `withInfraTx` and do not iterate tenants.

The deliverable does not exist today: there is no investments feature, no holding record, no price-fetch infrastructure, and no `investments_enabled` flag.

## Requirements

1. **Feature flag (`investments_enabled`)**: A per-budget boolean gates the entire feature.
   - Current: `tenancy.budgets` has `reserves_enabled`/`cushion_enabled` booleans; no investments flag exists.
   - Target: `investments_enabled boolean not null default false` on budgets; surfaced in the `GET /budgets/:id` DTO; toggled in the Settings tab and in the onboarding wizard features step using the existing `Switch`/`FeatureRow` pattern.
   - Acceptance: `PATCH /budgets/:id {investments_enabled}` persists and is reflected in the DTO; the wizard creates a budget with the chosen value; flipping it re-renders the wallets page with/without the section without a hard reload.

2. **Investments section placement & visibility**: The section is the last on the wallets page and only present when the flag is on.
   - Current: wallets page renders SPENDINGS → CUSHION → RESERVE sections; no investments section.
   - Target: an Investments section renders **after** all existing sections; absent entirely when `investments_enabled = false`.
   - Acceptance: with the flag off the DOM contains no investments section; with it on, the investments section is the final section in document order.

3. **Holding record & fields**: Each investment captures the full field set.
   - Current: no holding entity exists.
   - Target: a holding record persists `name`, `type`, `group` (nullable), `buy_price` + `buy_currency`, `quantity`, `current_price` (+ its currency), an optional instrument reference (symbol/provider) for custom-vs-tracked, and a per-section `sort_order`; tenant-scoped under RLS.
   - Acceptance: a created holding round-trips all fields through the API; Drizzle types live only in the adapter layer; `Money` is applied at the adapter boundary (no Dinero/big.js in the domain entity).

4. **Type enum (locked)**: Type is a fixed predefined list for future analytics.
   - Current: no type field.
   - Target: type ∈ `{ equities, etf, bond, crypto, reit, commodity, cash_fx, real_estate, other }` (locked; changing later is a migration). Enforced in domain + persistence (text + CHECK or pgEnum).
   - Acceptance: creating a holding with a value outside the set is rejected (4xx / domain error); all nine values are selectable in the edit Sheet.

5. **Group (free-text visual grouping)**: Group is an optional free-text label used only for visual grouping (e.g. by broker).
   - Current: no group field.
   - Target: nullable free-text `group`; an autocomplete in the Sheet suggests existing group names for that budget; holdings with the same group string render together; ungrouped holdings render flat.
   - Acceptance: two holdings sharing a group string render under one group header; a holding with empty group renders outside any group.

6. **Side-Sheet editing only (no inline)**: Holdings are created and edited exclusively in a right-side Sheet.
   - Current: wallet rows edit inline; the category Sheet is the side-popup precedent.
   - Target: investment rows have NO inline-editable cells; "+ Add" and a row action both open the same right-side `Sheet` (reusing the category-form-sheet pattern) submitting via `clientApiWrite()`.
   - Acceptance: there is no inline `<input>`/contenteditable on an investment row; clicking add or edit opens a Sheet; saving closes it and updates the cached list.

7. **Instrument search (debounced, unified universe, custom fallback)**: Typing an instrument suggests matches across asset classes.
   - Current: no instrument search exists.
   - Target: in the name field, after **2s** of no typing **or** on blur, a suggestion list appears with matches from a unified universe spanning **equities, ETF, FX, crypto, and precious metals (gold/silver coins)**; selecting a suggestion dismisses the list, keeps the typed name, **preselects `type`**, and **prefills `current_price`** from a live fetch; selecting **"custom"** leaves name as typed and all other fields manual.
   - Acceptance: a query like a known ticker returns ≥1 suggestion within the universe; selecting it sets a non-empty type and a non-empty current price; "custom" sets neither and marks the holding as untracked.

8. **Current-price → buy-currency conversion**: Profit/loss is computed in the buy currency.
   - Current: no conversion for holdings.
   - Target: when `current_price` currency ≠ `buy_currency`, convert via `FxProvider.rateAsOf` + `Money`, then compute P/L % = `(convertedCurrent − buyPrice) / buyPrice`.
   - Acceptance: a holding bought in EUR with a USD-priced instrument shows total value and P/L computed after USD→EUR conversion; same-currency holdings skip conversion.

9. **Per-holding render fields**: Each row shows the specified fields.
   - Current: no holding rendering.
   - Target: each holding renders `name`, `currency`, `total value` (`quantity × current_price`), `profit/loss %`, and `weight %` (within its group when grouped, else across the whole portfolio).
   - Acceptance: all five fields render per row; total value equals quantity × current price; P/L % sign matches gain/loss.

10. **Grouped rendering & weights (budget-default denominator)**: Groups roll up; weights use one currency.
    - Current: no grouping/weights.
    - Target: grouped holdings render under group headers; each group header shows the **group's % of total investments**; per-holding weight is within-group when grouped, else whole-portfolio; the portfolio total used as the weight denominator is computed by converting every holding's value to the **budget's default currency**. No section-level total or overall-P/L row is rendered (render exactly the specified fields).
    - Acceptance: within-group weights sum to ~100% per group; whole-portfolio weights (ungrouped) sum to ~100%; group-% values sum to ~100% across groups; denominators are in budget currency.

11. **Drag-and-drop (reorder + group reassignment, cross-section reject)**: DnD covers sorting and grouping.
    - Current: wallets reorder within a section via `@dnd-kit`; reorder API rejects cross-section IDs.
    - Target: holdings drag-reorder within the Investments section; dragging a holding **into** a group sets that group, **out of** a group clears/changes it; whole groups reorder; dragging a holding in from another wallet section is rejected.
    - Acceptance: dropping a holding onto another group persists the new group string; reordering within a group persists order; a cross-section drop is refused (no holding gains a foreign section).

12. **`PriceProvider` port + free-API adapter(s)**: A pluggable price port backs all fetching.
    - Current: greenfield — no port/adapter/table.
    - Target: a `PriceProvider` port (analogous to `FxProvider`) with free-API adapter(s) covering equities/ETF, crypto, FX, and precious metals, plus an instrument-search capability; a price-cache table (one current price per instrument) behind a cache repo.
    - Acceptance: the port resolves a current price for a known symbol in each covered asset class; adapters are injected via the module factory; no paid/API-key-gated premium tier is required to pass.

13. **Hourly cron — held instruments only**: Prices refresh hourly for instruments in use.
    - Current: no price job; the FX daily job is the cron precedent.
    - Target: an hourly pg-boss job fetches current prices for the **distinct set of instruments held by ≥1 budget** (custom/untracked holdings excluded) and upserts the price cache; reference-data scope (no per-tenant iteration).
    - Acceptance: the job updates prices only for held tracked instruments; an instrument no budget holds is never fetched; the job logs `{fetched, failed}`.

14. **Instant rate-limited fetch on add**: A newly-added uncached instrument is priced immediately, within limits.
    - Current: none.
    - Target: when a user selects a suggested instrument with no cached price, fetch it instantly; rate-limited to **10 instant fetches per user per minute**; on overflow the holding saves with the price marked pending and is picked up by the next hourly run (UI shows "price pending — updates within the hour").
    - Acceptance: the first ≤10 add-fetches/min/user return a live price; the 11th within the same minute defers (no live fetch) and the holding still saves; the deferred price later fills via the hourly job.

15. **Daily snapshot (price + FX) for future charts**: One row per held instrument and currency pair per day.
    - Current: `budgeting.fx_rates` persists daily FX; no instrument-price history.
    - Target: a daily job writes one row per held instrument per day capturing its last price, and ensures the day's FX rates for investment currency pairs are persisted (extending the existing `fx-daily-fetch` pair collection beyond `expense_ledger`). Snapshot tables are append-only history; charts are NOT built.
    - Acceptance: after a daily run, querying yields exactly one price row per held instrument for that date and one FX row per relevant pair/date; no chart UI is added.

16. **Client caching & optimistic UX**: Investments data flows through the existing React-Query cache.
    - Current: tabs use React-Query keys `["budget", id, "<tab>"]` with optimistic `clientApiWrite` mutations.
    - Target: a `use-investments` query under key `["budget", id, "investments"]` plus optimistic create/edit/reorder/group-change mutations (rollback on error, invalidate on settle), so the section renders instantly from cache and mutations apply without a full reload.
    - Acceptance: opening the section with warm cache shows data with no spinner; a create/edit/reorder reflects optimistically and reconciles on settle; offline writes degrade via the existing `clientApiWrite` toast/rollback path.

## Boundaries

**In scope:**

- `investments_enabled` per-budget flag — Settings toggle, onboarding wizard features step, `GET /budgets/:id` DTO, conditional section render.
- Investments section as the last section on the wallets page.
- Holding record + CRUD via a right-side `Sheet` (no inline edit), with the full field set (name, type, group, buy price/currency, quantity, current price, instrument ref).
- Locked 9-value Type enum; free-text Group with existing-group autocomplete.
- Debounced (2s / blur) instrument search across equities/ETF/FX/crypto/precious-metals; suggestion select (preselect type + prefill live price) or "custom".
- Current-price → buy-currency conversion; per-holding value / P/L % / weight %; grouped rendering with group-% of total; budget-default-currency denominator.
- DnD: reorder within section, group reassignment in/out, whole-group reorder; cross-wallet-section drop rejected.
- `PriceProvider` port + free-API adapter(s) + price-cache table; hourly held-only fetch; instant rate-limited (10/user/min) on-add fetch with hourly overflow.
- Daily snapshot of instrument last price + FX rates (extend the existing daily-FX job) — history rows only.
- React-Query client caching with optimistic create/edit/reorder.

**Out of scope:**

- Charts / capitalization graphs / time-series visualization — deferred to a future phase; this phase only PERSISTS the snapshot data they will consume.
- Investment buy/sell ledger, tax lots, dividends, fees, multi-buy cost-basis averaging — single buy price per holding; quantity is a manual snapshot, mirroring the wallet manual-balance model.
- Real-time / streaming / sub-hourly price updates — hourly cron + on-add fetch only.
- Paid or API-key-gated premium price tiers — free APIs only.
- Brokerage / open-banking sync or auto-updating quantity — manual entry only.
- Investment-related Tasks-queue kinds or alerts — the Tasks queue is untouched this phase.
- Whether holdings live in a new `investments` table vs. an extended `wallets` table, and whether `INVESTMENTS` joins the `wallet_type` enum — a HOW decision left to discuss-phase (this SPEC only fixes behavior, not table shape).
- PL/UK translation-quality review — message keys are added, but copy quality is not gated here (follows the existing i18n phase pattern).

## Constraints

- **Free APIs only**, collectively covering equities/ETF, FX, crypto, and precious metals (gold/silver), plus an instrument-search source spanning that universe. Concrete provider selection (e.g. Twelve Data free / CoinGecko free / metals.dev per the project stack) and their published rate limits are a **plan-phase research** item; the SPEC fixes "free" + coverage, not the vendor.
- **Reuse, do not rebuild, FX**: `budgeting.fx_rates` daily persistence, `FxProvider.rateAsOf`, and `Money` are the conversion path. The only FX change permitted is adding investment currency pairs to the existing daily fetch.
- **Reuse UI primitives**: shadcn `Sheet` (category-form-sheet pattern), `@dnd-kit`, React-Query + `clientApiWrite` optimistic pattern, `FeatureRow`/`Switch` for the flag.
- **Custom instruments** are never fetched (excluded from hourly cron and on-add fetch); their current price is manual.
- **Hexagonal discipline**: Drizzle types/queries only in `adapters/persistence/`; domain entities are plain classes; `Money` applied at the adapter boundary. Multi-tenant RLS on all new holding/price tenant data; reference-data price/FX tables follow the existing no-tenant-iteration job pattern.
- **Rate limit**: instant on-add fetch capped at 10 per user per minute; overflow defers to the hourly job (no user-facing error, holding still saves).

## Acceptance Criteria

- [ ] With `investments_enabled = false` the wallets page renders no Investments section; with `true` it renders as the last section.
- [ ] `investments_enabled` persists via `PATCH /budgets/:id` and is toggleable in both Settings and the onboarding wizard features step.
- [ ] Holdings are created/edited only through a right-side `Sheet`; investment rows expose no inline-edit affordance.
- [ ] Typing an instrument and idling 2s (or blurring) shows suggestions spanning ≥ equities, crypto, FX, and metals; selecting one sets a non-empty `type` and a non-empty `current_price`; "custom" leaves both manual.
- [ ] A holding whose buy currency ≠ current-price currency shows total value and P/L % computed after FX conversion to the buy currency.
- [ ] Within-group weights sum to ~100% per group; whole-portfolio (ungrouped) weights sum to ~100%; each group header shows its % of total investments; the denominator is computed in the budget's default currency.
- [ ] Dragging a holding into another group changes its group; dragging out clears/changes it; whole groups reorder; a cross-wallet-section drop is rejected.
- [ ] The hourly job fetches prices ONLY for instruments held by ≥1 budget (custom excluded); an uncached added instrument is fetched instantly, rate-limited to 10/user/min, with the 11th deferring to the hourly run.
- [ ] A daily job writes exactly one price row per held instrument per day and one FX-rate row per relevant currency pair per day; no chart UI is added.
- [ ] Investments data renders from the React-Query cache with optimistic create/edit/reorder (no full reload on mutation); offline writes degrade via `clientApiWrite`.
- [ ] `make ci-gate`, `make test`, and `bun run test` (Vitest) pass; new investment/price tables are covered by the tenant-leak gate; value/P-L/weight domain logic is unit-tested at ≥80%.

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                 |
| ------------------- | ----- | ----- | ------ | --------------------------------------------------------------------- |
| Goal Clarity        | 0.90  | 0.75  | ✓      | Outcome specific; charts explicitly excluded                          |
| Boundary Clarity    | 0.82  | 0.70  | ✓      | In/out explicit; table-shape & enum membership deferred to discuss    |
| Constraint Clarity  | 0.78  | 0.65  | ✓      | Rate limit, rollup ccy, type enum, debounce locked; vendor = research |
| Acceptance Criteria | 0.80  | 0.70  | ✓      | 11 pass/fail checks                                                   |
| **Ambiguity**       | 0.16  | ≤0.20 | ✓      |                                                                       |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective     | Question summary                                | Decision locked                                                                    |
| ----- | --------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0     | Researcher      | What exists today (flags/wallets/FX/prices)?    | FX daily persistence + Money/Sheet/dnd/RQ all EXIST; prices GREENFIELD             |
| 1     | Seed Closer     | Currency for portfolio total & weights?         | Budget default currency (per-item P/L stays in buy currency)                       |
| 1     | Boundary Keeper | Which aggregates to render?                     | Render exactly as specified — per-item fields + group % of total; no section total |
| 1     | Failure Analyst | Instant-fetch rate-limit policy?                | 10 per user per minute; overflow defers to hourly cron                             |
| 1     | Boundary Keeper | Lock the Type enum (analytics, hard to change)? | equities, etf, bond, crypto, reit, commodity, cash_fx, real_estate, other          |

---

_Phase: 09-investments-wallet_
_Spec created: 2026-06-20_
_Next step: /gsd-discuss-phase 9 — implementation decisions (holdings table vs wallet_type, provider selection, search index, snapshot schema, Sheet form layout)_
