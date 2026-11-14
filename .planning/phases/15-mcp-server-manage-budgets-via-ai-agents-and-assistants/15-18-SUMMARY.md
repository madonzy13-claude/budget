---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 18
status: complete
---

# 15-18 Summary: ship gate — @mcp E2E, full verification, real-client UAT

**E2E (MCP-10)** — `apps/web/e2e/features/mcp-connect.feature` (@mcp, Gherkin + Page Objects, fresh user): consent in EN/PL/UK on a phone viewport, MCP round trip (list tools, list_budgets, add_transactions, undo — row appears then disappears in the app), Connected apps lists the client and Disconnect makes the next /mcp call 401. Later UAT scenarios added: broker account in three currencies, owner sets the cushion and adds an income, assistant adds a deposit with all its details.

**UAT with a real Claude.ai session — user passed it 2026-11-11.** Fixes it drove (each TDD, red test committed first):
- set_category_limit takes a currency; get_fx_rate removed; instructions: never convert an amount unasked, past dates go in the date field.
- Investment writes refused in a budget with investments off, and the special Investments spendings category removed.
- Broker deposits keep the currency the user said.
- New tools: set_cushion / get_cushion, add/edit/delete/list_income, edit_budget (members rename for themselves, owner changes currency).
- Deposits keep rate, capitalization and end date; Edit lists them.
- Income writes owner-only in the app routes and over MCP (`owner_only`).
- add_transactions stops on a likely duplicate (same day, category, amount, currency) until `allow_duplicates: true`; instructions send a file, CSV or pasted list through import_preview → import_commit.
- Investments UAT spill-over (app, not MCP): ledger Edit for buys/sales/value/price updates/swaps, history-rate base amount, running totals, link fixes, fx_convert skip for same-currency rows.

**Verification**
- apps/api `test/mcp/`: 165/0. Income + MCP: 168 pass (one undo test times out under load, passes alone).
- `tests/tenant-leak/` run directly: 90/0.
- Investments package 342/0, web Vitest 436/0, E2E price/value edits green on chromium + mobile.
- tsc and eslint clean. Images rebuilt, api healthy.

**Deviations**
- `make ci-gate` not run — its teardown downs the live dev stack (cloudflared included). Same directory run directly.
- Test-account data from the UAT (two extra Tech 300 zł rows on Nov 7, CSV rows, Groceries/Transport categories) left for the user to undo.
