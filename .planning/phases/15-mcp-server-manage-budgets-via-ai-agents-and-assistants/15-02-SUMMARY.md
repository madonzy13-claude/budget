---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 02
status: complete
---

# 15-02 Summary: dispatch adapter + money boundary

- `apps/api/src/mcp/dispatch.ts` — `dispatch(app, who, opts)` → `{ok,status,body}`; identity in `internalRequests` WeakMap keyed on the Request; entry deleted in `finally`. Non-JSON bodies come back as text, empty as `null`.
- `authMiddleware` reads the WeakMap first; cookie path unchanged. No header-based identity anywhere.
- `apps/api/src/mcp/money.ts` — `toMinorUnits` / `fromMinorUnits` over shared-kernel `Money` (big.js) + `FIAT_CURRENCIES` (no new dep); range = exported `MAX_TXN_CENTS` from routes/transactions.ts.

## Deviations

- Tests 4-5 use a minimal app with the REAL authMiddleware → tenantGuard → idempotency middleware order (as createApp) instead of `createApp(await boot())` — no existing test boots the full app; same middleware, same DB.
- `toMinorUnits` returns `cents.toNumber()` (Big→number, exact for |x| ≤ 1e13), so the literal `grep "Number("` acceptance matches `.toNumber(`; no float parse anywhere.

## Verification

dispatch.test.ts 8/0, money.test.ts 4/0, transactions.test.ts green, eslint 0, tsc 0.
