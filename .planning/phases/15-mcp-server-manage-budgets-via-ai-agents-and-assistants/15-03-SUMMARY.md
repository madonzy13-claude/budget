---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 03
status: complete
---

# 15-03 Summary: transaction search route

- `TransactionRepo.searchPage(tenantId, budgetId, filters, cursor, limit)` — one query on expense_ledger via LEDGER_SELECT (Phase 14 converted amounts), excludes deleted/dismissed/deferred (same visibility as listForMonth), keyset `(transaction_date, id) <`, `LIMIT limit+1`. Note filter is `ILIKE '%' || $q || '%'` bound param.
- `GET /budgets/:budgetId/transactions/search?from&to&category_id&kind&q&limit(1..200, default 200)&cursor` registered before `/:txId`. Response `{ transactions: serializeRow[], next_cursor }`; bad cursor → 422 `invalid_cursor`.
- Unconfirmed rows included (`confirmed_at: null`).

## Notes

- Uses `withTenantTx` like `listForMonth` (neighbour pattern) rather than `withTenantTxRead`.
- `%`/`_` in `q` act as wildcards (no escaping) — harmless, data-only.

## Verification

transactions-search 7/0 (455 rows over 3 pages, ordering, filters, injection-as-data, cross-user 403), transactions.test.ts + route-coverage-audit green, tsc + eslint clean.
