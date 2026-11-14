---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 17
status: complete
---

# 15-17 Summary: prompts, account-deletion cascade, MCP tenant-leak gate

**Prompts (MCP-09)** — `apps/api/src/mcp/prompts.ts`, registered in `buildMcpServer`:
- `monthly_review {budget_id, month}`: get_budget_overview → spending_summary for the month → list_tasks → exactly 3 concrete actions for the week; ask before changing anything.
- `import_spreadsheet {budget_id}`: any file → strict JSON rows of one kind, ≤ 500 per call → import_preview → ask the user only once about every issue → never invent a category → import_commit → mention import_undo.
- `reconcile_wallets {budget_id}`: list_wallets → ask for every actual balance in one message → sync_wallet_balance → report old → new, the difference, and the total per currency.
- Static, server-authored text; no "draft" anywhere (test + grep).

**Account deletion (MCP-11)**
- `purgeUserData`'s user-level step deletes the user's rows in identity.oauth_refresh_token, oauth_access_token, oauth_consent, shared_kernel.mcp_import_previews and mcp_write_log, inside the same transaction. These tables are user-scoped, which is why they are not in TENANT_TABLES. oauth_client stays, because anonymous DCR links it to no user.
- The E2E cleanup list (`cleanup-fixture-data.ts` USER_TABLES) now includes the two shared_kernel tables.

**Tenant-leak gate (MCP-05)** — `tests/tenant-leak/mcp-cross-tenant.test.ts`. Real OAuth tokens go through the real app. `run-tenant-leak.sh` runs `bun test tests/tenant-leak`, so the file is picked up with no runner change. It proves:
- A's token never lists B's budget.
- search_transactions, get_budget_overview, list_wallets, add_transactions (into B's budget, or into A's own budget naming B's category), edit_transaction (B's id via either budget), undo (B's real call_id) and import_preview with B's budget are all errors, and B's transactions are unchanged.
- A budget A joins after consenting is readable and writable with the same token (D-01). Once A is removed, the same token gets errors and the budget is no longer listed (D-03).
- list_recent_writes never shows B's call, even on the shared budget.

**Bugs the gate found, fixed (TDD):**
- **Foreign category accepted.** `POST /budgets/A/transactions` stored a row in A pointing at B's category: RLS hid it from reads, but the reference was kept. Now `lib/own-category.ts categoryMissing()` refuses with **422 category_not_found** on transaction create, edit and bulk-recategorize, and on scheduled-payment create and edit. A permanently deleted category is refused the same way (15-20 had noted that a deleted category didn't fail a scheduled payment). Tested in `test/routes/foreign-category.test.ts`.
- **import_preview** on a budget the user cannot open saved an empty preview: every read 404'd and was treated as empty. It now returns the route's error up front.

**Verification**
- prompts 5/5 plus registry.
- identity + tenancy gate: 106/0.
- apps/api `test/routes/` + `test/mcp/`: 677/0.
- `tests/tenant-leak/` run directly against the running DB: 90/0.
- tsc and eslint clean.

**Deviations**
- **`make ci-gate` was not run.** Its runner ends with `docker compose down --remove-orphans`, which would stop the whole live dev stack, cloudflared included. The same test directory was run directly instead, with identical scope.
- **Sessions are readable without a GUC, by design.** `no-guc-zero-rows` checks that identity.sessions shows 0 rows without a GUC, but its policy `sessions_owner_select` is `USING (true)`. That is a documented Phase 1 trade-off: Better Auth reads the session to authenticate before a user GUC exists. The check only passed because no earlier gate file created a session in the shared testcontainer. The MCP gate test signs its users out in `afterAll`, leaving the container as it found it. The gate entry is not changed; it is flagged to the owner.
- One old scheduled-payments route test posted a random category uuid; it now posts `category_id: null`.

Commits: test(15-17) prompts RED, fe5d8443, cascade RED, 0bc6b927, gate + foreign-category RED, 7b307b77.
