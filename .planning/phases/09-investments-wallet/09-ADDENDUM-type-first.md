---
phase: 09-investments-wallet
kind: addendum
status: as-built
created: 2026-06-21
supersedes:
  - "09-UI-SPEC.md §Sheet Form Layout (name-first, 9-type form)"
  - "09-SPEC.md §Locked 9-value Type enum"
  - "09-SPEC.md §price providers (metals.dev)"
---

# Phase 9 Addendum — Post-completion evolution (UAT + provider rework + type-first redesign)

This addendum is the **as-built source of truth** for changes made AFTER Phase 9 was
marked complete (7/7 plans). The original `09-SPEC.md` / `09-UI-SPEC.md` remain as the
historical contract; where they conflict with this file, **this file wins**. Driven by
owner UAT on the live stack.

## 1. UAT defect fixes (commit 96d1abd, 5c83ddf, b723cf1)

UAT exposed five issues in the shipped 09-07 web surface:

| #        | Symptom                                    | Root cause                                                                                                                                                        | Fix                                                                        |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0 (root) | Create/list/search/reorder silently failed | Hooks called `/investments` (wallets-style root) but the route is mounted budget-scoped at `/budgets/:budgetId/investments`; the optimistic insert masked the 404 | All client calls repointed to `/budgets/${budgetId}/investments…`          |
| 1        | Flag toggle needed a page reload           | Settings toggle didn't invalidate the budget-detail query                                                                                                         | `qc.invalidateQueries(["budget", id, "detail"])` on toggle                 |
| 2        | Search "BTC" found nothing                 | Instruments table empty (daily seed cron hadn't run) + crypto not searchable by ticker                                                                            | Seed the universe; crypto display names carry the ticker ("Bitcoin (BTC)") |
| 3        | Custom → couldn't pick Type                | Instrument-search dropdown re-ran on blur and overlaid the Type field                                                                                             | Dropdown closes on blur (no blur-search)                                   |
| 4        | "Create {name}" literal                    | ICU single-quotes (`'{name}'`) escape the placeholder                                                                                                             | Switched to double quotes                                                  |

Regression guard added: the add-custom E2E reloads and re-asserts the row so a
masked-by-optimism 404 cannot regress green again.

## 2. Price-provider rework (commits 4e39179, 8e51fbf, 603cd65)

Provider routing changed from the original SPEC pick (Twelve Data / CoinGecko /
metals.dev):

| Asset class                           | Provider                                | Symbols                         |
| ------------------------------------- | --------------------------------------- | ------------------------------- |
| US equities / ETF / REIT / bond-ETF   | **Finnhub** (free 60/min, no daily cap) | AAPL, VOO, O, VNQ, AGG, BND …   |
| non-US equities/ETF + precious metals | **Twelve Data** (free 800/day)          | VWCE; XAU/USD, XAG/USD, XPT/USD |
| crypto                                | **CoinGecko** (demo)                    | bitcoin, ethereum, solana       |

- **metals.dev dropped** — its 100 req/mo free tier was too tight. metals priced via
  Twelve Data FX pairs. The metals-dev adapter stays in-tree as an unused fallback.
- **Multi-key failover** — every adapter accepts a CSV/array of keys (`*_API_KEYS`) and
  advances to the next key on a rate/credit limit (HTTP 429 + Twelve Data's
  200-with-`code:429`); falls back to `NoPriceAvailable` when all keys are exhausted.
  Singular `*_API_KEY` still honored.
- **Configurable cadence** — the held-instrument price scan runs on `PRICE_SCAN_CRON`
  (default `0 */3 * * *`, every 3h UTC) instead of hourly, so the distinct-instrument
  fan-out stays within free-tier daily caps (lower frequency ⇒ more distinct
  instruments). Env var forwarded to api + worker via compose.
- Keys are SECRETS → Infisical (`FINNHUB_API_KEYS`, `TWELVE_DATA_API_KEYS`,
  `COINGECKO_API_KEYS`). Until set, tracked + metals show the price-blocked banner;
  manual/cash holdings work without any provider.

## 3. Type-first redesign (migration 0039; commits d2e688f, 2b98d7b, a030d51)

The add/edit Sheet now leads with **Type**; the chosen UI type drives which fields show
and how the holding is priced. Eleven user-facing types, four behaviors:

| UI type                                                 | Behavior    | Fields (in order)                                                                                                                                                                                       | holding_type                  |
| ------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Equity, ETF, Exchange-traded bonds, REIT, Crypto        | **tracked** | Type · **Asset** (autocomplete filtered to the type's asset_class) · buy price · buy currency · quantity · current price _(read-only, fetched)_ · group                                                 | equities/etf/bond/reit/crypto |
| Retail treasury bonds, Collectibles, Real estate, Other | **manual**  | Type · name · buy price · buy currency · quantity · current price _(editable)_ · group                                                                                                                  | bond/other/real_estate/other  |
| Precious metals                                         | **metals**  | Type · name · **metal** (gold/silver/platinum) · **kind** (coin/bar/other) · **UoM** (g/oz/kg) · quantity · buy price · buy currency · current price _(fetched spot, UoM-converted, read-only)_ · group | commodity                     |
| Cash                                                    | **cash**    | Type · name · currency · amount · group                                                                                                                                                                 | cash_fx                       |

### Data model (migration 0039)

`budgeting.investments` gained:

- `ui_type` (11-value CHECK) — the exact form type; backfilled from `holding_type` for
  pre-9.1 rows. Disambiguates cases `holding_type` can't (ETB vs treasury-bond → both
  `bond`; collectibles → `other`).
- `metal` (gold/silver/platinum), `metal_kind` (coin/bar/other), `unit_of_measure`
  (g/oz/kg) — precious-metals only.

### Metals pricing

Metals link to their spot instrument (gold→XAU/USD, silver→XAG/USD, platinum→XPT/USD;
web resolves the instrument via the type-filtered search on metal-select). Value + P/L
convert spot-per-troy-ounce to the chosen UoM:
`OZ_PER_UNIT = { oz:1, g:1/31.1034768, kg:1000/31.1034768 }`,
`value = quantity × spotPerOzCents × OZ_PER_UNIT[uom]`. `kind` is a descriptive label
only (no per-coin premium).

### Search

`GET /budgets/:id/investments/search?q=&type=<asset_class>` — the Asset autocomplete is
filtered to the selected type. Universe extended with REITs (O, VNQ), bond ETFs
(AGG, BND), platinum (XPT/USD).

### i18n

`budget.investments.uitype.*` (11), `metalOption.*` (3), `kindOption.*` (3),
`uomOption.*` (3), `field.{asset,metal,kind,uom}` across EN/PL/UK.

## 4. Verification (live + automated)

- Domain 19 (incl. metals UoM value/P-L) + adapters 16 (incl. Finnhub + key failover)
  bun:test; web 12 vitest; typecheck 0; check:i18n PASS.
- `@investments-wallet` E2E: 6 passed, 0 flaky.
- Playwright (live, budget-dev): type-first ordering; per-type field swap
  (tracked/metals/manual/cash); type-filtered autocomplete (AAPL→equities, AGG→bond);
  manual "Other" add persists with `ui_type=other`; metals metal→instrument resolution
  (price-blocked banner without provider keys = correct degraded state).

## 5. Still open (UAT)

- Provider API keys not yet set → tracked + metals live price shows the price-blocked
  banner. Add `FINNHUB_API_KEYS` / `TWELVE_DATA_API_KEYS` / `COINGECKO_API_KEYS` to
  Infisical to light up fetched prices.
- Visual/interaction polish + the deferred items in `09-HUMAN-UAT.md`.
- Palladium (XPD/USD) easy to add to the Metal dropdown if wanted.
