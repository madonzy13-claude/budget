---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 14
status: complete
---

# 15-14 Summary: investment, scheduled payment and task write tools

**Investments** (`write-investments.ts`):
- `record_investment_transaction` (buy, sell or transfer):
  - **Buy:** a new asset goes to `POST /investments`. Buying more of an existing asset goes to `/:id/buy`, as kind `quantity` (quantity + unit price) or kind `amount` (a total).
  - **Sell:** the agent gives the quantity sold, and the tool turns it into the route's `left` = held − sold, using big.js through `Money`, never a float. `destination.wallet_id` sends the money out to that wallet with `received`; `destination.asset_id` uses the existing-holding destination; no destination means the money leaves investments.
  - **Transfer:** to an existing asset, or to a new asset named `new_asset_name`.
- `update_holding_value`: `value` for amount assets and `unit_price` for hand-priced quantity assets, sent as `PATCH /:id`.
- `delete_investment_entry`: `DELETE /entries/:id`. The route still enforces newest-first (409 `not_newest`) and reverses the wallet credit.
- **Logging:** the routes do not return entry ids, so each write lists the asset's entries before and after and logs every new entry as an `investment_entry` create effect. Under decision a1, those are the entries undo can delete while they are still newest; the descriptions say so.
- **destructiveHint:** `update_holding_value` and `delete_investment_entry`.

**Planning** (`write-planning.ts`):
- The five tools are `create_scheduled_payment`, `edit_scheduled_payment`, `delete_scheduled_payment`, `confirm_scheduled_payment` and `complete_task`.
- **Input mapping:** `edit_scheduled_payment` maps snake_case fields to the route's camelCase `edits`, with `applyToFuture` defaulting to true. `confirm_scheduled_payment` takes `occurrence_id`, maps it to `drafts/:draftId/confirm`, and accepts an optional `amount` that becomes `amount_override_cents`.
- **No "draft" wording:** route errors containing "draft" are reworded to "occurrence". A test checks every tool description and input schema; it strips the json-schema `$schema` URL first, which contains "draft/2020-12".
- **Logging:** each tool logs before and after; the create route returns `{ruleId}`, so the full rule is re-read for `after`.
- **destructiveHint:** `delete_scheduled_payment`.

**Tests:**
- write-tools-investments: 8. Covers crypto precision 0.12345678, a sale crediting a wallet by 2500.00, the newest-first refusal, a delete with its log row, a hand value, and the daily cap across all 3 tools.
- write-tools-planning: 6. Covers create, edit, confirm, delete, complete, and the daily cap across all 5 tools.
- registry: now 17 write tools, with the destructive set asserted.
- Full `test/mcp/`: 89/0. tsc and eslint clean.

**Deviations:**
- `delete_investment_entry` takes `asset_id` as well: no route reads a single entry, so `before` comes from the asset's entry list.
- Prices go through `toMinorUnits`, which allows 2 decimals. Sub-cent unit prices, which the edit route accepts up to 6 places, are not exposed.
- If a log row fails to write (seen during development when an effect had no id), the write itself still lands and the result carries `undo_available: false`, as designed.

Commits: f0b71bec, 193e428e, f00d3e5b, 00a86f3c.
