---
slug: possessions-wallet
status: complete
date: 2026-07-21
---

# Possessions wallet section

Add a new "Possessions" wallet section (house/car/jewelry/…): name + currency +
a single amount + a per-item icon. Part of capitalization (net worth) but
EXCLUDED from the retirement runway. Placed after the investments section,
always on. TDD throughout.

## Decisions (user)

- **Storage:** new `possession` holdingType reusing the investments table (savings
  precedent — no new repo/route code). +1 nullable `icon` column (migration 0066).
- **Gating:** always on (no feature flag).
- **Icons:** reuse the existing wallet icon-picker (`WalletCustomizer`) with a
  possession-specific set, icon-only (no color).

## Model

- capitalization = wallets + investments + possessions (possessions ARE net worth).
- retirement pot = capitalization − possessions (not liquid drawdown wealth).
- investment value / cost basis / the wealth pie all EXCLUDE possessions.

## Tasks (TDD red→green)

Backend (bun:test) — committed `998abada`:
1. domain holding.ts (`possession` + HOLDING_TYPES) ✓
2. contracts api.ts (holdingType/uiType/map + `icon` on create/DTO) ✓
3. migration 0066 (icon column + widen 2 CHECKs) + `_journal.json` + schema sync ✓
4. repo icon write/read; use-cases + route serializer ✓
5. HoldingsValuationPort.possessionsValueCents; boot + worker split ✓
6. compute-budget-wealth-now (capitalization incl., subtotal exposed) ✓
7. get-overview-cards retirement excludes possessions; aggregate carries subtotal ✓

Web (Vitest) — committed `6b20e16e`:
8. use-investments HoldingType + HoldingDto.icon ✓
9. lib/possession-icons.ts ✓
10. WalletCustomizer `icons` + `showColor` props ✓
11. PossessionSheet / PossessionRow / PossessionsSection ✓
12. investments-section filters possessions out ✓
13. wallets-sectioned-list renders PossessionsSection after investments ✓
14. aggregate-overview runway subtracts possessions_cents ✓
15. i18n en/pl/uk ✓

Deploy + verify:
16. migration applied to dev DB + rebuild migrator/api/worker/web
17. Playwright-verify on budget-dev (add possession → section → capitalization up,
    retirement flat).
