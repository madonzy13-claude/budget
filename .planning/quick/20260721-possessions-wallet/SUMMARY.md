---
slug: possessions-wallet
status: complete
date: 2026-07-21
---

# Summary: Possessions wallet section

## Delivered

New **Possessions** wallet section (house/car/jewelry/…): name + currency + a
single value + a per-item **icon and color**. Always on, rendered after
investments, **edited INLINE exactly like the spendings/reserve/cushion wallet
rows** (no sub sheet — staged draft add-row, in-row editors). Part of
capitalization (net worth) but EXCLUDED from the retirement runway. Live-verified
on budget-dev (E2E green + screenshots).

## Model

- Storage: new `possession` holdingType reusing the investments table (savings
  precedent — no new repo/route code) + two nullable columns `icon` (mig 0066) +
  `color` (mig 0067).
- capitalization = wallets + investments + possessions.
- retirement pot = capitalization − possessions (BDP + aggregate paths).
- investment value / cost basis / wealth pie all EXCLUDE possessions.

## Changes (TDD red→green each)

Backend (`998abada`):
- domain `holding.ts` (`possession` + HOLDING_TYPES), contracts `api.ts`
  (holdingType/uiType/map + optional `icon` on create/DTO).
- migration `0066_investment_possession.sql` (icon column + widen 2 CHECKs) +
  `_journal.json` idx 66 + schema CHECK/column sync.
- repo icon write/read (INSERT/UPDATE/SELECT/findById + mapRow), NewHolding port,
  create/update use-cases, list-holdings DTO, route serializer.
- `HoldingsValuationPort.possessionsValueCents`; boot + worker filter possessions
  out of investment value/cost/pie and sum them separately.
- `compute-budget-wealth-now` (capitalization incl. possessions, subtotal exposed),
  `get-overview-cards` retirement pot excludes possessions, aggregate carries
  `possessions_cents`.

Web (`6b20e16e`):
- `possession-icons.ts`, `PossessionSheet`, `PossessionRow`, `PossessionsSection`.
- `WalletCustomizer` gained `icons` + `showColor` props (icon-only reuse).
- investments-section filters possessions out; wallets-sectioned-list renders the
  new section after investments.
- `icon` on web HoldingDto + create/update hooks; aggregate-overview runway
  subtracts `possessions_cents`. i18n en/pl/uk.

E2E (`@possessions-wallet`): feature + steps + `PossessionsPo` — 2 scenarios
(always-on section; add→persist through the widened CHECK + icon column). Both
pass vs budget-dev.

## Tests

- bun:test: domain/contracts/wealth/overview-cards/aggregate green.
- Vitest: possessions (7) + aggregate-overview (7, incl. a possessions-shorten-
  runway case) green; 145 investments+aggregate web tests pass.
- E2E: 2 @possessions-wallet scenarios pass vs budget-dev.

## Deploy

Migration 0066 applied to dev DB (icon column + `possession` in both CHECKs);
migrator/api/worker/web rebuilt + restarted (cloudflared untouched). Web+api healthy.

## Notes

- Possessions render only in their own section — deliberately kept OUT of the
  investments list AND the wealth pie (they're net worth, not investments).
- Inline editing reuses `InlineEditCell` + `CurrencyPicker` + `WalletCustomizer`
  (the wallet primitives); `WalletCustomizer` gained `icons` + `showColor` props.
  Icon = 13 curated keys (`lib/possession-icons.ts`); color = wallet hex palette.
  `// ponytail:` valuation port now does 3 listHoldings passes — fold if hot.
- Left on dev during UAT: a throwaway user `poss-uat-*@test.local` with a
  "Possessions UAT" budget (Family home + Tesla) — isolated, safe to leave.
- Branch `feat/investment-savings-type` (stacked). NOT pushed.
