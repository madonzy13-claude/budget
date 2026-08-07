---
task: Possessions become WALLETS + a new "Other" wallet type
slug: pwo-possessions-as-wallets-plus-other
created: 2026-07-31
mode: quick
status: planned
---

# Possessions are wallets, not holdings — plus a new "Other" type

## User decision (2026-07-31)

> "Possessions and other should not be treated as an investment holding. It's
> more like a wallet, it has same attributes with the only exclusion that
> possessions are not count into retire calculation."

Plus: the section must sort/drag like the other wallet sections (including
across sections, reserve keeps its budget-currency rule), and a NEW "Other"
section goes at the BOTTOM of the assets list — counted in BOTH capitalization
and retirement, with its own capitalization-pie slice.

## Why this is the small change

Wallets already have everything a possession needs (name, currency, balance,
icon, color, sort_order) AND the entire cross-section drag machinery
(`wallets-sectioned-list.handleCrossSectionDrop` → PATCH walletType, reserve
currency rejection). Modelling possessions as holdings is what forced the
bespoke read-only section. Move them to `budgeting.wallets` and the sorting,
dragging, swipe-delete and inline edit all come for free.

## Layers

**DB — migration 0070**
- `wallets_wallet_type_chk` → add `'POSSESSION'`, `'OTHER'`.
- Data move: every non-archived `budgeting.investments` row with
  `holding_type='possession'` → a `POSSESSION` wallet (name, currency =
  current_price_currency, balance = current_price_cents / 100, icon, color,
  sort_order, actor_user_id); then archive the holding rows.
- The `'possession'` holding type stays in the investments CHECK (historic +
  archived rows), but nothing creates it anymore.

**Domain / API (packages/budgeting, apps/api)**
- `WalletType` union + Zod enums: `SPENDINGS | CUSHION | RESERVE | POSSESSION | OTHER`.
- Reserve currency rule unchanged (RESERVE only).
- `compute-budget-wealth-now`: capitalization already sums ALL wallets, so
  POSSESSION + OTHER fold in automatically; `possessions_value_cents` switches
  from "Σ possession holdings" to "Σ POSSESSION wallets" (still subtracted for
  the retirement pot W). OTHER is deliberately NOT subtracted.
- `get-all-budgets-aggregate`: same substitution (share-scaled).
- `boot.ts` holdings valuation: drop the possession branch.

**Web**
- Delete `possessions-section.tsx` / `possession-row.tsx`; render two more
  `WalletSection`s (POSSESSION, then OTHER last) INSIDE the existing wallets
  DndContext so drag/sort works with no new code.
- Capitalization pie: add an `Other` slice + its own color; possessions slice
  stays.
- i18n: section titles + add-CTA for OTHER in en/pl/uk; possessions keys keep
  their (restored) wording.

## TDD order

1. `packages/budgeting` unit: wealth math with POSSESSION + OTHER wallets
   (capitalization includes both; retirement excludes only POSSESSION).
2. `apps/api` integration (real Postgres): create/patch a wallet of each new
   type; cross-type PATCH; reserve currency rule still rejects.
3. Migration test: possession holdings land as POSSESSION wallets.
4. Web: wallets-sectioned-list renders 5 sections and drags between them;
   pie has an Other slice.
