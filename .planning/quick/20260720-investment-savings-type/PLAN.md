---
slug: investment-savings-type
status: in-progress
date: 2026-07-20
---

# Quick Task: `savings` investment type + `other` icon swap

## Design (approved)

New investment type **savings**: manual `name, currency, starting amount, current
amount`. No qty in UI (stored `quantity="1"` under the hood). Row shows current
value + `started $X` + %change = `(current−starting)/starting`. Chart over time
via existing 3h wealth snapshots (no backdate — same as deposit).

**Model:** rides the manual-holding machinery exactly like the existing `broker`
type. `starting → buy_price_cents`, `current → current_price_cents`, `qty=1`,
no instrument, no auto-fetch. `%change` = existing `profitLossPct` (free).

**Distinct type** (`holdingType="savings"` + `uiType="savings"`) so it gets its
own investments-pie slice + Wallet icon + accent color (pie groups by
holding_type). Icon: `savings=Wallet`; `other`: `MoreHorizontal → Shapes`.

## Tasks (TDD red→green each)

### Backend (packages)
1. **domain** `holding.ts`: add `"savings"` to `HoldingType` union + `HOLDING_TYPES`.
   Test: `isHoldingType("savings")`; portfolio-metrics `profitLossPct` for a
   savings-shaped holding = (current−starting)/starting.
2. **contracts** `api.ts`: add `"savings"` to `holdingTypeSchema`, `uiTypeSchema`,
   `UI_TYPE_TO_HOLDING_TYPE` (`savings:"savings"`). Test: create schema parses a
   savings payload; map resolves.
3. **migration**: raw SQL ALTER both CHECKs (`holding_type`, `ui_type`) → add
   `savings`; register in `drizzle/meta/_journal.json`. Sync CHECK strings in
   `investments-schema.ts`. Integration test: insert holding_type/ui_type=savings
   succeeds (was rejected). (needs `infisical run --env=dev`.)

### Frontend (apps/web)
4. **investment-types.ts**: `UiType` + `UI_TYPE_META.savings` (holdingType savings,
   behavior savings) + `UI_TYPE_ORDER` + `deriveUiType`. Vitest.
5. **investment-icons.ts**: `UI_TYPE_ICON.savings=Wallet`, `UI_TYPE_COLOR.savings`
   (new hue), `other: MoreHorizontal→Shapes`. Vitest.
6. **holding-sheet.tsx**: `savings` behavior branch cloned from `broker` — render
   Name/Currency/Starting/Current (no qty), canSave, buildPayload (qty="1",
   buy=starting, current=current, holdingType/uiType savings), changeType reset,
   preview. Vitest.
7. **investment-row.tsx**: `showQty` excludes savings; `started $X` subtitle. Vitest.
8. **i18n** en/pl/uk: `uitype.savings` + `field.startingAmount`/`currentAmount`.

### E2E
9. Playwright/BDD: add-savings flow (pick Savings → name/currency/starting/current
   → save → row shows value + started + %change).

## Zero-change (explorer-verified)
holding-repo, ports, create/update use-cases, investments route, list-holdings,
portfolio-metrics, compute-budget-wealth-now, boot valuation adapter.

## Verify
tsc + eslint(0-warn) + bun test + web vitest + docker build web&api + restart +
Playwright add-savings on budget-dev.
