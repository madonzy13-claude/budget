---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 01
status: complete
requirements: [MCP-01, MCP-02, MCP-10]
---

# 15-01 Summary: packages gated + installed, product decisions recorded

## Decisions

- `investment_undo: a1` — agent undo of investment entries goes through the existing newest-first `DELETE /budgets/:id/investments/entries/:entryId`; skipped + reported when no longer newest or edited since; an entry DELETE is not undoable; `update_holding_value` undone by PATCH back to `before`.
- `wallet_history: b2` — user: "this is only useful for rendering charts for capitalization so user see his progression history from day one". Dated wallet-balance import writes month-end wealth snapshots (plan 15-21 runs); newest row also sets current balance as in b1.
- **Versions (user: "use context7 to fetch latest stable")** — context7 MCP unauthenticated in session, so resolved from npm dist-tags `latest`:
  - `@better-auth/oauth-provider` **1.7.18** (not 1.7.15 as planned). Its peers require `better-auth ^1.7.18` + `better-call 1.4.5`, so **better-auth bumped 1.7.15 → 1.7.18** everywhere (root override + apps/web, packages/identity, packages/tenancy). Later plans that say 1.7.15 mean 1.7.18.
  - `@modelcontextprotocol/server` 2.4.0 (apps/api dep), `@modelcontextprotocol/client` 2.4.0 (apps/api devDep) — already latest.

## Provenance (T-15-SC)

- oauth-provider: repo github.com/better-auth/better-auth, maintainers bekacru / better-gustavo, no install scripts.
- MCP server/client: repo github.com/modelcontextprotocol/typescript-sdk, no install scripts. User approved install of latest stable.

## Verification

- `rm -rf node_modules && bun install --frozen-lockfile` → 0
- `bun audit --audit-level=high` → 0
- `bun test packages/identity packages/tenancy` → 97 pass / 0 fail (exit 1 = coverage threshold, identical on pre-bump baseline)
- bun.lock: single `better-auth@1.7.18`, single `better-call@1.4.5`

## Files

package.json, apps/api/package.json, packages/identity/package.json, packages/tenancy/package.json, apps/web/package.json, bun.lock
