---
slug: possessions-wallet
status: complete
date: 2026-07-21
---

# Summary: Possessions wallet section

## Delivered

New **Possessions** wallet section (house/car/jewelry/…): name + currency + a
single value + a per-item icon. Always on, rendered after investments. Part of
capitalization (net worth) but EXCLUDED from the retirement runway. Live-verified
on budget-dev (E2E green + screenshots).

## Model

- Storage: new `possession` holdingType reusing the investments table (savings
  precedent — no new repo/route code) + one nullable `icon` column (migration 0066).
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
- Icon is a per-item curated key (13 icons), stored in the new `icon` column;
  icon-only picker (no color, no new color column). `// ponytail:` valuation port
  now does 3 listHoldings passes — fold into one if it ever gets hot.
- Left on dev during UAT: a throwaway user `poss-uat-*@test.local` with a
  "Possessions UAT" budget (Family home + Tesla) — isolated, safe to leave.
- Branch `feat/investment-savings-type` (stacked). NOT pushed.
