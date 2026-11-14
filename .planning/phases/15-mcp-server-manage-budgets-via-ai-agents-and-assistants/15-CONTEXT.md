# Phase 15: MCP server: manage budgets via AI agents and assistants - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

A remote MCP server (Streamable HTTP at `/mcp`, OAuth 2.1) that lets any MCP client (Claude.ai, ChatGPT, Claude Desktop, Cursor) act on the user's budgets as the user: read everything the user sees, write (add/edit/delete/sync) through the same use cases the web app uses, and import old data in any format that the agent normalises to strict JSON. Settings gains a minimal "Connected apps" page.

Tool list, excluded-by-design list, safety model and 3-wave split are fixed in ROADMAP.md Phase 15 — this document records the decisions that refine or OVERRIDE that text.

**Overrides of ROADMAP.md wording (decided in this discussion):**

- "Consent per budget" → consent is for **all of the user's budgets** (D-01).
- "void_transaction (reversal entry)" → **reuse existing delete behaviour**, no reversal entries (D-09).
- "every MCP write audited with 'via <client>' badge + undo in UI" → **no visible badge, no UI undo**; audit is hidden, undo is an agent tool (D-07, D-11).
- "import_preview → user sees summary" → preview is a server check the agent uses; user is only asked when problems exist (D-15).

</domain>

<decisions>
## Implementation Decisions

### Consent, scopes, connection

- **D-01:** Grant covers **all budgets the user is a member of**, including budgets the user joins/creates later (no per-budget checkboxes, no snapshot at consent time).
- **D-02:** Two scopes only: `read` (default) and `write` (opt-in, covers every write tool incl. import and budget create).
- **D-03:** Agent permissions = the user's own role in each budget, never more. MCP tools call the same use cases with the same authorisation checks as the web routes.
- **D-04:** Budget created via `budget_create` is automatically usable by that connection (falls out of D-01).
- **D-05:** Any MCP client may connect via **Dynamic Client Registration** (standard MCP auth spec). No allowlist, no personal API tokens in this phase.
- **D-06:** Connection lives **until the user disconnects** — short access token + rotating refresh token, no idle expiry (consistent with 365-day session stance).

### Writes, delete, undo

- **D-07:** Writes apply **immediately**. Rows created/changed by an agent are **indistinguishable in the UI** from the user's own — no "added by Claude"/"via <client>" mark anywhere. (Client-side confirmation is the MCP client's job; tool annotations `readOnlyHint`/`destructiveHint` still set.)
- **D-08:** A hidden server-side record of every MCP write (connection/client id, tool call, affected entity ids, before/after) is kept — needed for agent undo and audit. Not rendered in the app.
- **D-09:** Delete = **exactly what the app does today**: spendings/incomes soft-delete (`transactionRepo.softDelete`); investment entries follow the newest-first deletion rule from Phase 13.1. No reversal entries, no new delete semantics.
- **D-10:** `sync_wallet_balance` sets the balance like the app's wallet edit (`set-wallet-balance` use case) and returns old → new + difference to the agent.
- **D-11:** **No Undo button in the app.** The agent gets an undo tool that reverts its own previous write(s) using the D-08 record (incl. `import_undo(batchId)`).
- **D-12:** Agent may change old months (past entries, past limits) — same rules as the app.
- **D-13:** Max **500 rows per write call**; bigger imports are split into several calls by the agent.

### Import

- **D-14:** Importable data: spendings + incomes, monthly category limits, investment history, wallet balance history, scheduled payments.
- **D-15:** Flow: agent sends normalised rows to a server check (`import_preview`) → if problems (duplicates, unknown categories, FX gaps) the agent asks the user about **all of them at once**, then commits **everything in one go**. Nothing is saved until problems are resolved. A clean preview commits without asking the user.
- **D-16:** Duplicates (same day + amount + category as an existing entry) are reported as a list; user answers once ("skip all / add all / pick these").
- **D-17:** Unknown categories: agent proposes a mapping to existing categories (or "create new"), user confirms. Never silent auto-create, never a catch-all bucket.
- **D-18:** Foreign-currency rows keep their original currency and convert at that date's rate — the Phase 14 typed-amount behaviour.

### Family / shared budgets

- **D-19:** Connecting an assistant is **private** to the user — other budget members are not told, no member-list marker.
- **D-20:** Agent reads everything the user sees in shared budgets, incl. other members' entries and notes. User-authored text is returned as clearly labelled data fields (lethal-trifecta mitigation from ROADMAP stays).
- **D-21:** Settings → Connected apps: per user; shows client name, connected date, last used, **Disconnect**. No activity history, no permission switch (reconnect to change scope).

### Reads

- **D-22:** Both aggregates (spending_summary etc.) and individual entries via `search_transactions` over **full history**, paged (200/page).
- **D-23:** Tasks queue and all Overview numbers (reserve fit, forecast/projection, net worth/wealth) are readable — same numbers the app shows.

### Abuse limits

- **D-24:** Per connection: **60 reads/min, 20 writes/min**.
- **D-25:** Per connection: **5 000 written entries/day**.

### Claude's Discretion

- Undo tool shape (single `undo_last` vs `undo(callId)`), how far back the agent can undo, and how it behaves when the user has since hand-edited an affected row (must never clobber user edits).
- `import_preview` TTL / storage, duplicate-match tolerance details.
- Rate-limiter storage (current `apps/api/src/middleware/rate-limit.ts` is an in-memory Map — fine for one API instance; decide if it must survive restarts).
- Exact OAuth implementation (see open research item below).
- Prompts content (monthly review / import spreadsheet / reconcile wallets) — user did not discuss; follow ROADMAP wording.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope

- `.planning/ROADMAP.md` §"Phase 15: MCP server" — tool list, exclusions, safety model, waves (as overridden above)
- `.planning/STATE.md` — Roadmap Evolution entry for Phase 15

### Prior-phase decisions that constrain this phase

- `.planning/phases/14-multi-currency-budgets-changeable-budget-currency-per-catego/14-CONTEXT.md` — multi-currency rules (limit = category currency, typed-amount conversion) used by import + writes
- `.planning/phases/13.1-investments-assets-with-transactions-type-asset-transaction-/13.1-CONTEXT.md` — investment entry ledger, newest-first delete, buy/sell/transfer semantics

### External specs (researcher to fetch)

- MCP specification — Authorization (OAuth 2.1 + DCR + protected resource metadata) and Streamable HTTP transport
- Better Auth docs — MCP / OAuth-provider plugin

### Open research item

- **Better Auth 1.7.15 bundle has NO `mcp` or `oidc-provider` plugin dir** (`node_modules/.bun/better-auth@1.7.15*/.../dist/plugins` has only `jwt`, `device-authorization`, `generic-oauth`, `oauth-popup`, `oauth-proxy`). Researcher must find where the OAuth authorisation-server capability lives for 1.7.x (separate `@better-auth/oauth-provider` package?) and whether it supports DCR + refresh rotation. better-auth is an exact pin + `overrides` entry — see CLAUDE.md "Held-back versions"; gate any change on `bun test packages/identity packages/tenancy`.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/api/src/routes/*.ts` — every write the MCP needs already has a route + use case (transactions, wallets, investments, categories, category-limits, scheduled-payments, tasks, budgets, fx, overview-*, spendings-summary, reserve-fit). MCP tools wrap the same use cases.
- `packages/platform/src/idempotency/` (repo, middleware, schema) — reuse for `add_transactions(idempotencyKey)`.
- `packages/platform/src/audit/schema.ts` — `shared_kernel.audit_history` (tenant RLS, before/after jsonb, `actorUserId` only). No client/connection column — D-08 needs either a column or a separate MCP-write table.
- `apps/api/src/middleware/rate-limit.ts` — in-memory `checkAndRecord(key, windowSec, max)`.
- `packages/budgeting/src/application/set-wallet-balance.ts` — D-10.
- `transactionRepo.softDelete` (used by `DELETE /transactions/:txId`) — D-09.

### Established Patterns

- Better Auth configured in `packages/identity/src/adapters/persistence/better-auth.ts`; plugins passed via `additionalPlugins` from `apps/api/src/boot.ts:263` (currently only `tenancy.organizationPlugin`).
- Hexagonal: MCP is a new driving adapter in `apps/api`; no Drizzle outside `adapters/persistence`; Money as decimal string + currency at the MCP boundary.
- Writes that change spending trigger `syncReserveTopup(...)` in the route — MCP path must trigger the same side effects (put them in the use case or call the same helper).
- `tracingMiddleware` registered first in `createApp`; `/mcp` must sit behind it.

### Integration Points

- `/mcp` route on apps/api + OAuth endpoints + `.well-known` metadata.
- Web: Settings → Connected apps page (list/disconnect), consent screen.
- Cloudflared tunnel exposes the API — remote clients (Claude.ai) must reach `/mcp` on the public host.

</code_context>

<specifics>
## Specific Ideas

- User wants agent activity to feel like their own hands: no badges, no "via Claude" — trust is in the agent client's own confirmations plus the agent's undo.
- Import is "ask me once about everything, then save it all" — no partial saves.
- Plain-language UX: never say "draft" to the user (existing rule) — applies to tool descriptions the agent may echo too ("unconfirmed scheduled payment").

</specifics>

<deferred>
## Deferred Ideas

- Personal API tokens for CLIs/scripts that can't do OAuth — not chosen for v1.
- Per-budget consent / per-domain write scopes — rejected for v1 in favour of simplicity; revisit if users ask.
- Activity history + undo in Connected apps — rejected (user prefers asking the agent).

</deferred>

---

_Phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants_
_Context gathered: 2026-11-05_
