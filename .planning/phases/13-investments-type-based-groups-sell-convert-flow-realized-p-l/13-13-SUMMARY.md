---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 13
subsystem: web
tags: [edit, history, undo, what-happened]
key-files:
  created:
    - apps/web/src/hooks/use-holding-history.ts
    - apps/web/src/hooks/use-adjust-holding.ts
    - apps/web/src/components/budgeting/wallets-tab/history-section.tsx
    - apps/web/test/investments/history-section.test.tsx
  modified:
    - apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx
    - apps/web/src/components/budgeting/wallets-tab/sell-sheet.tsx
    - apps/web/src/components/budgeting/wallets-tab/investments-section.tsx
    - apps/web/src/hooks/use-create-holding.ts
    - apps/web/src/lib/investment-types.ts
    - apps/web/test/investments/holding-sheet.test.tsx
requirements-completed: [D-03, D-05, D-06, D-09, ROADMAP-13.5, ROADMAP-13.6]
---

# 13-13 Summary: Edit side — What happened?, History, Add date

- `HistorySection` (native `<details>`, collapsed, "History (n)"): newest first, kind label, date (day+month+year in one Intl call), signed amount, realized note, to/from counterparty, "Automatic" on Start, 44px delete. Confirm uses full-undo copy (conversion variant names the other holding). `useDeleteHistoryEntry` → DELETE /history/:id, refetches the whole investments prefix (both legs' histories, holdings, type summary) + overview; refusals toast errUndoLaterFirst / errWouldEmpty.
- Edit (HoldingSheet): cost basis inputs (deposited / principal / buy price) read-only; PATCH never carries buyPriceCents or quantity (and not currentPrice when a value change is booked). Live "What happened?" radiogroup when an amount holding's value changes (Value changed default; increase → Added money; decrease → Withdrew money with Amount received prefilled + Date); quantity increase → Bought more (paid prefilled = Δqty × price); quantity decrease → "Sold some" closes the sheet and opens SellSheet with `initialLeft`. Footer label follows the choice. Type picker shows changeTypeHelper in edit. History mounted in edit.
- Create: Date (addDate, default today, max today) → `openedOn`.
- `holdingShape` moved to lib/investment-types (shared by Sell and Edit).

## Verification
- Vitest: history-section 7/0, holding-sheet 43/0 (withdraw/add/value_change/buy/sold-some/read-only/change-type/history/openedOn); full web suite 2686 pass / 0 fail; tsc + eslint clean.
- `make build-web`: buildId `2026-10-26 11:18:23`; served page chunk contains `history-section` and `happened-`.
- 3-locale 390px live check runs as part of 13-14's `@investments-history` E2E (same build) — evidence recorded in 13-14-SUMMARY.

## Deviations
- Collapsible = native `<details>` (no shadcn Collapsible in the kit).
- Create shows Date from the start (not gated on a chosen type) so it's reachable/testable; Type remains the first field.
- "What happened?" appears live as soon as a change is detected (not after a first Save press) — same choices, one less click.
- Deposits: no "What happened?" (principal read-only, value computed); withdrawing from a deposit = Sell (D-20).

## Self-Check: PASSED
