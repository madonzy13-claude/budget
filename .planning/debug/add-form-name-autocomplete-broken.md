---
status: diagnosed
trigger: "add-form-name-autocomplete-broken — In Add investment, the name autocomplete over existing assets of the type doesn't work on dev."
created: 2026-10-28
updated: 2026-10-28
---

## Current Focus

hypothesis: CONFIRMED — Add form renders AssetNameCombobox only for non-tracked behaviors; crypto/stocks (auto-priced, behavior "tracked" && !manualEntry) get InstrumentSearchInput (catalog search) instead, which never queries /investments/names. Same testid holding-sheet-name hides the difference.
test: code read holding-sheet.tsx:799-854 + dev DB + pg_stat_statements + served bundle grep
expecting: n/a
next_action: return diagnosis (find_root_cause_only)

## Symptoms

expected: D-02 — Add form name field autocompletes over existing assets of the selected type, incl. hidden qty-0; picking existing name joins that asset.
actual: "Autocomplete doesn't work" (iOS PWA, budget-dev.madonzy.com). E2E for 13.1 reportedly passed.
errors: none reported
reproduction: Wallets → Investments → Add investment → pick type → type existing asset name (e.g. "Bitcoin", "Diamonds").
started: Phase 13.1 UAT, 2026-10-28

## Eliminated

- hypothesis: stale served bundle
  evidence: web container created 23:18 after last combobox commit 3dabc752 (23:16); served chunk page-c4bc2026a16dd4b8.js contains "asset-name-option-"
  timestamp: 2026-10-28
- hypothesis: GET /names empty / ui_type mismatch / RLS
  evidence: dev DB ui_type populated on all rows (no NULLs; Diamonds=collectibles, Bitcoin (BTC)=crypto); RLS keys only on app.tenant_ids; pg_stat_statements shows listNames query executed ~290 calls returning rows
  timestamp: 2026-10-28
- hypothesis: hook enabled/key wrong
  evidence: useAssetNames enabled = uiType !== null; holding-sheet passes uiType || null; key per (budget, uiType). Fine.
  timestamp: 2026-10-28

## Evidence

- timestamp: 2026-10-28
  checked: holding-sheet.tsx lines 726-854
  found: nameField (AssetNameCombobox) rendered only when behavior === "tracked" && manualEntry, or behavior is manual/metals/cash/broker/deposit. For behavior "tracked" && !manualEntry (stocks, crypto — investment-types.ts:54-57) the field is InstrumentSearchInput (catalog search, MIN_CHARS, provider results). It shares testid holding-sheet-name.
  implication: crypto/stocks Add form has no existing-asset autocomplete at all. "Bitcoin" case can never work.
- timestamp: 2026-10-28
  checked: E2E investments-assets.feature + InvestmentsPo + holding-sheet.test.tsx
  found: autocomplete scenario uses "collectibles" only; unit test uses cash. No tracked-type coverage.
  implication: why E2E passed while user sees it broken.
- timestamp: 2026-10-28
  checked: create-holding.ts
  found: backend joins by trimmed case-insensitive name within ui_type for all types (except deposit) — so a tracked buy joins only if the instrument label equals the stored name; custom-named rows (e.g. "BTC - SafePal") never match the catalog label.
  implication: fix must surface existing assets in the tracked path, not just backend.

## Resolution

root_cause: Add form wires AssetNameCombobox only for manual-style types; auto-priced tracked types (crypto, stocks/ETF) use InstrumentSearchInput, which searches the external catalog and never calls GET /investments/names. E2E/unit cover collectibles/cash only.
fix:
verification:
files_changed: []
