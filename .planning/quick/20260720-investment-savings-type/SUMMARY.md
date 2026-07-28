---
slug: investment-savings-type
status: complete
date: 2026-07-20
---

# Summary: `savings` investment type + `other` icon swap

## Delivered

New **Savings** investment type: manual `name, currency, starting amount, current
amount` (no qty in UI, `quantity="1"` under the hood). Row shows current value +
`Started: {amount}` + `%change = (current−starting)/starting`. Own investments-pie
slice, Wallet icon, lime accent. `other` icon `MoreHorizontal → Shapes`.

**Model:** savings is mechanically the existing `broker` type (manual two-amount,
qty=1) with its own `holdingType`/`uiType` and relabeled Starting/Current. `%change`
= existing `profitLossPct` — zero new compute. Chart over time via the existing 3h
wealth snapshots (no backdate — same as deposit).

## Changes (TDD red→green each)

- `packages/investments/src/domain/holding.ts` — `HoldingType` union + `HOLDING_TYPES`.
- `packages/investments/src/contracts/api.ts` — holdingType/uiType enums + `UI_TYPE_TO_HOLDING_TYPE`.
- `drizzle/0065_investment_savings.sql` + `_journal.json` idx 65 + schema CHECK sync.
- `apps/web/src/lib/investment-types.ts` — UiType, `UI_TYPE_META.savings` (holdingType
  savings, behavior `broker`), `UI_TYPE_ORDER`, `deriveUiType`.
- `apps/web/src/lib/investment-icons.ts` — `savings=Wallet` + lime `#84cc16`; `other=Shapes`.
- `apps/web/src/hooks/use-investments.ts` — web `HoldingType`.
- `holding-sheet.tsx` — savings labels Starting/Current (broker field-set); preview
  relabel; buildPayload/canSave unchanged (holdingType from the meta).
- `investment-row.tsx` — hide qty for savings; `Started: {amount}` caption.
- `messages/{en,pl,uk}.json` — uitype.savings, field.starting/currentAmount,
  preview.starting, row.started.

## Tests

- Domain (holding, metrics), contracts, web (types, icons, holding-sheet, row) —
  all green. 128 investments Vitest + 100 investments bun-test pass.
- E2E `@investments-wallet`: "Add a savings holding persists…" — **passes vs
  budget-dev** (fresh user → enable → add → visible → persists after reload).

## Live verification (budget-dev, Travel budget)

Type picker shows Savings; form = Name/Starting/Currency/Current (no qty); preview
`Starting 10,000 · Current 12,500 · P/L +2,500 (+25.0%)`; saved with 0 errors; row
`Emergency fund · +25.0% +2,500 · USD 12,500 · Started: 10,000 · Share: 100.0%` with
the lime Wallet icon.

## Notes

- Migration 0065 applied to dev DB + migrator rebuilt (CI fresh-DB safe).
- Desktop row shows value+%change; "Started" is in the mobile-expanded caption
  (mobile-first). `// ponytail:` add a desktop "started" column if wanted.
- Left on dev during UAT: investments enabled on the **Travel** budget + a
  "Emergency fund" savings holding — remove if unwanted.
- Branch `feat/investment-savings-type` (off the email/aggregate stack). NOT pushed.
