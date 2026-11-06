---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 15
status: complete
---

# 15-15 Summary: undo

**Restore route.**
- `POST /budgets/:id/transactions/:txId/restore` uses the new `TransactionRepo.restore`, which sets `deleted_at = NULL` and emits a `transaction.restored` outbox event, then runs `syncReserveTopup` exactly like DELETE.
- Errors: 409 `not_deleted` for a live row and 404 for an unknown id. Another tenant's id never gets a 200.
- Tests: 4 new, all passing; transactions and route-coverage tests stay green.

**undo.ts.**
- `undoCallOrBatch(ctx, id, { mode, callId })` walks the call's or batch's open log rows newest-first and runs the matching inverse through the app's routes. `markReverted` runs after each successful inverse.
- **Errors:** `not_found` covers ids from another connection or user, and an undo's own call id, since undo writes no log rows. Also `already_reverted` and `outside_undo_window` (7 days).
- **Inverses:**

  | Entity / write | Inverse |
  | --- | --- |
  | transaction create | DELETE |
  | transaction update | PATCH back to before |
  | transaction delete | restore |
  | wallet / wallet_balance | PUT the old balance |
  | category_limit | POST the previous limit; with no previous limit, POST `noLimit` for that month |
  | category create | archive; in rollback mode, also hard DELETE, but only when the create's `batch_id` is the batch being rolled back |
  | category update | rename back and/or archive ↔ unarchive |
  | investment_entry create | DELETE the entry. A 409 means it is no longer newest: skipped in agent mode, failed in rollback |
  | scheduled_payment create | DELETE |
  | scheduled_payment update | PATCH back to before, `applyToFuture` |

- **Changed-since check (agent mode only):** compares the fields the tool wrote against `after_jsonb` and skips if any differ.
- **Not undoable by tool:** budget_create, confirm_scheduled_payment, complete_task, delete_scheduled_payment, delete_investment_entry.
- **Rollback mode:** no changed-since skip, and every inverse is applied. Failures go to `failed_inverses` and the logger; nothing is swallowed.
- **Tools:**
  - `undo`: a writeTool with destructiveHint, `entryCount` 0 (not counted toward the daily cap), and it writes no log rows.
  - `list_recent_writes`: a readTool, grouped by call, with `reverted` and `undoable`.
- **Write-log order:** `insertWriteLog` now stamps `clock_timestamp()` instead of `now()`, so the rows of one call keep their write order. Before, every row of a call had the same `now()`, and newest-first fell back to random uuid order.

**Tests:**
- undo.test: 13, covering every inverse, the changed-since skip, not_undoable, the three guards, list_recent_writes, and a rollback of a mixed batch (category with 2 transactions, a limit with no previous limit, 2 investment entries on a new asset, a wallet balance, a scheduled payment). After the rollback, nothing from the batch is left.
- Full `test/mcp/` plus restore: 106/0. tsc and eslint clean.

**Deviations:**
- **Undoing a limit that had no previous limit** writes the app's own "No limit" segment. The effective read is then `noLimit: true` rather than the earlier 404. The test accepts either: both mean the category is unbounded that month.
- **Entity name:** the wallet entity is logged as `wallet` (15-13). Undo accepts both `wallet` and `wallet_balance`, so 15-16 import can use either.
- **Found, not fixed (investments, Phase 13.1):** on a hand-valued asset whose stored price was null (a savings pot created with only a buy amount), "update value" records `priorPriceCents = null`. Deleting that value entry, whether by the user's own Delete or by undo, then stores `currentPriceCents = "0"` instead of null. Cause: `delete-entry.ts` subtracts the value delta from 0 when there is no prior price to restore. The undo test asserts only that the exact entry was removed.
- **Test timeouts:** two tests got 30s/60s timeouts because their 20+ round trips exceed bun's 5s default under load.

Commits: 4d81d88b, 97ecdf70, a42ac307, d49b3aaf.
