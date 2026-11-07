---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 20
status: complete
---

# 15-20 Summary: import commit for the other four kinds

**KIND_COMMIT** is now a full `Record<Kind, KindCommit>`, so a missing kind is a compile error. Each kind runs the same function as the write tool that makes that single write, with the row's Idempotency-Key `${preview_id}:${kind}:${i}`:

| Kind | Function (extracted from) | Logged |
| --- | --- | --- |
| transactions | inline POST (as 15-16) | transaction create |
| category_limits | `setCategoryLimit` (set_category_limit) | category_limit update, before/after = effective limit + month |
| scheduled_payments | `createScheduledPayment` (create_scheduled_payment) | scheduled_payment create |
| investment_entries | `recordInvestmentTxn` (record_investment_transaction) | investment_asset create (new asset) + one investment_entry create per added entry |
| wallet_balances | `syncWalletBalance` (sync_wallet_balance) | wallet update |

- The extracted functions take an optional `idempotencyKey`; the tools call them without one, so their behaviour is unchanged.
- `setCategoryLimit` gained an import-only `no_limit`, which writes the app's own "No limit" segment for that month.
- **New assets across rows:** the first row naming a `new_asset` creates it; later rows with the same name (case-insensitive) in the same commit use its id. Rows are already stored oldest first (15-16).
- **Wallet result (D-10):** `wallets: [{wallet_id, old_balance, new_balance, difference, currency}]` plus `history_not_stored`. Older wallet rows are still only reported; 15-21 stores them as snapshots (decision b2).
- **Undo:** a new `investment_asset.create` inverse in undo.ts. It comes up after its entries (it is logged first). Holding gone → reverted. Still there → skipped in agent mode, failure in rollback.
- Investment undo follows a1: an entry is deleted only while it is the newest; otherwise it and its asset are skipped.

**Tests:** `import-kinds.test.ts`, 14 tests. Each kind has commit, rollback to zero changes and undo with a changed-since skip; scheduled payments also cover replay (`preview_expired`). Full `test/mcp/`: 138/0. tsc and eslint clean; the `Partial<Record`, `parseFloat|Number(` and `draft` greps return nothing.

**Deviations:**
- **Bug fixed — asset type:** `record_investment_transaction` created new assets with `holdingType` only and no `uiType`. A quantity-1 asset was then "amount-shaped", so a later quantity buy failed with `shape_mismatch`, while the app showed it as a quantity type. `new_asset.type` now takes the app's own types (`uiTypeSchema`: stocks, crypto, precious_metals…; legacy etf/equity/reit still accepted), and the server's `UI_TYPE_TO_HOLDING_TYPE` gives `holdingType`, as the app form does.
- **Rollback triggers** (all data-driven, no test flag):
  - category_limits: the row's category is permanently deleted between preview and commit (404), as planned.
  - scheduled_payments: a deleted category does **not** fail the POST, so row 3 has `end_date` before `first_due_date` (route 400). The preview does not check that.
  - wallet_balances: an archived wallet **still accepts** a balance, and there is no wallet delete route. The failing row names a currency other than the wallet's own, which the repo refuses (WALT-04). The preview does not check wallet currency either.
  - investment_entries: a sell of more than held, refused by the tool's own check before the route.
- `record_investment_transaction`'s log now has 2 rows for a new asset (asset + entry); its test was updated.
- The obsolete 15-16 test "other kinds wait for 15-20" was removed.

Commits: 73db58e3 (RED), cac03945 (GREEN).
