---
phase: 09-investments-wallet
plan: 03
subsystem: api
tags: [ports, adapters, price-provider, drizzle, trigram-search, tdd, ssrf]

# Dependency graph
requires:
  - phase: 09-investments-wallet
    provides: "09-01 instruments/investments/price-cache tables; 09-02 Holding entity"
provides:
  - "PriceProvider port + InMemoryPriceProvider stub (refuses to fabricate)"
  - "Twelve Data / CoinGecko / metals.dev price adapters + CompositePriceProvider"
  - "DrizzleInstrumentRepo (local trigram search), DrizzleHoldingRepo, DrizzlePriceCacheRepo"
affects: [09-04, 09-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Price adapter = injected (apiKey, fetchFn) + FIXED host constant + NoPriceAvailable on error (no cache in adapter; cache is a separate repo)"
    - "metals.dev daily-only gate: throw MetalsDailyOnlyError before fetch when context=hourly"
    - "InstrumentRepo.search = parameterized drizzle trigram ILIKE (bound ${q}), ranked exact>prefix>name, active-only, >=2 chars"
    - "drizzle execute<T> needs a `type` (not `interface`) row alias to satisfy Record<string,unknown>"

key-files:
  created:
    - packages/investments/src/ports/price-provider.ts
    - packages/investments/src/ports/holding-repo.ts
    - packages/investments/src/ports/instrument-repo.ts
    - packages/investments/src/ports/price-cache-repo.ts
    - packages/investments/src/adapters/price/twelve-data.ts
    - packages/investments/src/adapters/price/coingecko.ts
    - packages/investments/src/adapters/price/metals-dev.ts
    - packages/investments/src/adapters/price/composite-price-provider.ts
    - packages/investments/src/adapters/persistence/holding-repo.ts
    - packages/investments/src/adapters/persistence/instrument-repo.ts
    - packages/investments/src/adapters/persistence/price-cache-repo.ts
    - packages/investments/test/adapters/price/twelve-data.test.ts
    - packages/investments/test/adapters/price/coingecko.test.ts
    - packages/investments/test/adapters/price/metals.test.ts
    - packages/investments/test/adapters/instrument-repo.test.ts
    - packages/investments/test/ports/price-provider.test.ts
  modified: []

key-decisions:
  - "Price adapters are stateless live-fetchers (apiKey + fetchFn) — PriceProvider port has no cache param; instrument_price_cache is keyed by instrument_id (not symbol) and owned by the job/use-case layer"
  - "currentPrice opts.context gates metals.dev daily-only; composite forwards context"
  - "Adapters return currency 'USD' (providers omit it); the use-case reconciles vs instruments.quote_currency"
  - "DrizzleHoldingRepo.listForBudget LEFT JOINs instrument_price_cache so tracked holdings read live price (round(price*100)::bigint); custom holdings keep their column — the 09-01 read-time price JOIN"
  - "bigint cents bound as strings (node-postgres has no native bigint param)"

patterns-established:
  - "New monorepo package: per-file coverage gate trips bun exit-1 when a loaded src file is <80% within a test subset — cover loaded ports/adapters or run the full package suite"

requirements-completed: [INV-07, INV-12]

# Metrics
duration: 13min
completed: 2026-06-21
---

# Phase 9 Plan 03: Ports + Adapters Summary

**PriceProvider port + 3 free-API price adapters (fixed-host, key-injected, typed errors) + composite router + Drizzle Holding/Instrument(trigram-search)/PriceCache repos — TDD, 34 tests green, investments coverage 99.5%.**

## Performance

- **Duration:** ~13 min
- **Tasks:** TDD feature (RED → GREEN; no REFACTOR needed)
- **Files:** 16 created (11 src + 5 test)
- **Tests:** 34 pass / 0 fail (price adapters mocked-HTTP; instrument-repo real Postgres)

## Accomplishments

- `PriceProvider` port mirrors FxProvider; `InMemoryPriceProvider` refuses to fabricate (throws NoPriceAvailable).
- 3 adapters with FIXED hosts (api.twelvedata.com / api.coingecko.com / api.metals.dev — T-9-06 SSRF guard), constructor-injected keys (T-9-07, never logged), AbortSignal timeouts; `CompositePriceProvider` dispatches by provider id.
- metals.dev throws `MetalsDailyOnlyError` from the hourly context WITHOUT fetching (Pitfall 3 / T-9-09 quota guard).
- `DrizzleInstrumentRepo.search`: parameterized trigram (bound `${q}`, T-9-08), ranks exact>prefix>name, ≥2-char min, active-only, never touches a provider (D-04).
- `DrizzleHoldingRepo` (withTenantTx CRUD + price-cache JOIN) and `DrizzlePriceCacheRepo` ready for P04/P06.

## Task Commits

1. **RED: failing tests** — `70282d3` (test)
2. **GREEN: ports + adapters + repos** — `3fbd353` (feat; incl. InMemoryPriceProvider + findById coverage tests)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] drizzle execute<T> rejected the named `interface` row type**

- **Found during:** GREEN typecheck
- **Issue:** `db.execute<InstrumentRow>` failed — a named interface doesn't satisfy drizzle's `Record<string,unknown>` constraint.
- **Fix:** changed `interface InstrumentRow` → `type InstrumentRow`.
- **Committed in:** `3fbd353`

**2. [Rule 3 - Blocking] per-file coverage gate tripped bun exit-1**

- **Found during:** GREEN full-suite run (29 pass/0 fail but exit 1)
- **Issue:** `price-provider.ts` (51%, InMemoryPriceProvider untested) and `instrument-repo.ts` (74%, findById untested) were below the 80% per-file gate when loaded by the subset.
- **Fix:** added `test/ports/price-provider.test.ts` + findById cases → all loaded files ≥96%, aggregate 99.5%, exit 0.
- **Committed in:** `3fbd353`

**3. [Rule 1 - Bug] "process.env" literal in adapter comments failed the no-env grep**

- **Found during:** acceptance grep (`grep -L process.env`)
- **Issue:** twelve-data/coingecko comments mentioned "process.env" though the code never reads env.
- **Fix:** reworded comments to "reads env vars directly".
- **Committed in:** `3fbd353`

---

**Total deviations:** 3 auto-fixed (2 bug, 1 coverage). **Impact:** typecheck/coverage/grep gates only; design as specified. No scope creep.

## Issues Encountered

None beyond the above.

## User Setup Required

Price provider API keys (TWELVE_DATA_API_KEY / COINGECKO_API_KEY / METALS_DEV_API_KEY) — see 09-01-SUMMARY user-setup. Adapters take keys via constructor; the factory (P06) supplies them from Infisical. Live fetches in P04/P06 need them; this plan's tests mock HTTP.

## Next Phase Readiness

- 09-04 price jobs inject CompositePriceProvider + PriceCacheRepo + InstrumentRepo (metals routed daily-only).
- 09-06 routes use HoldingRepo + InstrumentRepo.search + the on-add fetch (rate-limited via api_rate_limits).

---

_Phase: 09-investments-wallet_
_Completed: 2026-06-21_
