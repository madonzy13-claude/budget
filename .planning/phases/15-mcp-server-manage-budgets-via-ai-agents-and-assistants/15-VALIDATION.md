---
phase: 15
slug: mcp-server-manage-budgets-via-ai-agents-and-assistants
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-05
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | bun:test (api/packages, real Postgres) · Vitest 4 + happy-dom (web) · Playwright + Gherkin (E2E) · `@modelcontextprotocol/client` inside bun:test (MCP protocol) |
| **Config file**        | `bunfig.toml`, `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts`                                                                                      |
| **Quick run command**  | `cd apps/api && bun test test/mcp` (needs infisical / DATABASE_URL_APP)                                                                                          |
| **Full suite command** | `make test && (cd apps/web && bun run test) && make ci-gate`                                                                                                     |
| **Estimated runtime**  | ~60 seconds quick · ~10 min full                                                                                                                                 |

---

## Sampling Rate

- **After every task commit:** targeted `bun test apps/api/test/mcp/<file>` (red then green); plus `bun test packages/identity packages/tenancy` when auth config changes
- **After every plan wave:** `make test`, `cd apps/web && bun run test`, `make ci-gate`
- **Before `/gsd:verify-work`:** full suite + `make test-e2e` (`@mcp`, stack rebuilt via `make dev-build`, served bundle verified) + `bun audit --audit-level=high`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Requirement keys follow RESEARCH.md §Validation Architecture (MCP-01..MCP-11). Task IDs are filled by the planner/executor.

| Task ID | Plan | Wave | Requirement  | Threat Ref         | Secure Behavior                                                                                                              | Test Type        | Automated Command                                                  | File Exists | Status     |
| ------- | ---- | ---- | ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ | ----------- | ---------- |
| 15-05 | 15-05 | 0/1  | MCP-01       | Token theft/replay | DCR→authorize→consent→token, PKCE S256 required, refresh rotates, replay rejected                                            | integration      | `bun test packages/identity/test/oauth-provider.test.ts`           | ✅       | ✅ green |
| 15-05 | 15-05, 15-19 | 1    | MCP-01       | —                  | identity/tenancy regression gate 99/0                                                                                        | regression       | `bun test packages/identity packages/tenancy`                      | ✅          | ✅ green |
| 15-05 | 15-05 | 0    | MCP-01       | —                  | refresh without `offline_access`; refresh expiry (spike)                                                                     | integration      | `bun test apps/api/test/mcp/oauth-lifetime.test.ts`                | ✅       | ✅ green |
| 15-07 | 15-07 | 1    | MCP-02       | Confused deputy    | no token → 401 + `WWW-Authenticate resource_metadata`; wrong aud → 401; read token on write tool → scope error               | integration      | `bun test apps/api/test/mcp/auth.test.ts`                          | ✅       | ✅ green |
| 15-07 | 15-07 | 1    | MCP-02       | —                  | well-known metadata served at web root                                                                                       | integration      | `bun test apps/api/test/mcp/well-known.test.ts`                    | ✅       | ✅ green |
| 15-02 | 15-02 | 1    | (structural) | Header spoofing    | internal dispatch identity via WeakMap; forged `x-mcp-*` header never authenticates                                          | unit             | `bun test apps/api/test/mcp/dispatch.test.ts`                      | ✅       | ✅ green |
| 15-10 | 15-10 | 1    | MCP-04       | Prompt injection   | read tools match routes; search paged (200) over full history; user text labelled                                            | integration      | `bun test apps/api/test/mcp/read-tools.test.ts`                    | ✅       | ✅ green |
| 15-07 | 15-07 | 1    | MCP-09       | Exfiltration       | tool allowlist; annotations correct                                                                                          | unit             | `bun test apps/api/test/mcp/registry.test.ts`                      | ✅       | ✅ green |
| 15-11 | 15-09, 15-11 | 1    | MCP-03       | Open redirect      | consent + Connected apps render/allow/disconnect                                                                             | component        | `cd apps/web && bunx vitest run test/connected-apps.test.tsx`      | ✅       | ✅ green |
| 15-13 | 15-13, 15-14 | 2    | MCP-05       | Cross-tenant       | write tools == route DB state + side effects; idempotent replay no-op                                                        | integration      | `bun test apps/api/test/mcp/write-tools.test.ts`                   | ✅       | ✅ green |
| 15-17 | 15-17 | 2    | MCP-05       | Cross-tenant       | user A token cannot touch user B budget; later-joined budget reachable; removed member not                                   | ci-gate          | `make ci-gate`                                                     | ✅      | ✅ green |
| 15-15 | 15-15 | 2    | MCP-06       | Mass write         | undo reverts create/update/delete; skips hand-edited rows; undo-of-undo rejected                                             | integration      | `bun test apps/api/test/mcp/undo.test.ts`                          | ✅       | ✅ green |
| 15-16 | 15-16, 15-20, 15-21 | 2    | MCP-07       | Mass write         | preview reports dupes/unknown cats/FX gaps; commit all-or-nothing; import_undo                                               | integration      | `bun test apps/api/test/mcp/import.test.ts`                        | ✅       | ✅ green |
| 15-06 | 15-06 | 2    | MCP-08       | DoS                | 61st read/21st write per min denied; 5001st entry/day denied; keyed per connection                                           | unit+integration | `bun test apps/api/test/mcp/limits.test.ts`                        | ✅       | ✅ green |
| 15-17 | 15-17 | 2    | MCP-11       | —                  | account deletion purges write-log/previews/OAuth rows                                                                        | integration      | `bun test packages/identity/test/account-deletion-cascade.test.ts` | ✅      | ✅ green |
| 15-18 | 15-18 | 3    | MCP-10       | —                  | SDK client lists tools + calls list_budgets/add_transactions/undo through real stack; consent in 3 locales on phone viewport | e2e              | `make test-e2e` (`@mcp`)                                           | ✅       | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [x] `apps/api/test/mcp/` helpers: `mintMcpToken(user, scopes)` (real DCR + authorize + consent + token with PKCE), SDK-client factory, `trace.disable()` setup
- [x] `packages/identity/test/oauth-provider.test.ts` — OAuth round trip
- [x] Spike: token lifetime (offline_access / refresh expiry), consent-delete revokes tokens, real Claude.ai connection through tunnel
- [x] Gherkin feature + page objects for consent + Connected apps (`@mcp`), fresh-user fixture
- [x] `bun add -d @modelcontextprotocol/client@2.4.0` (behind legitimacy checkpoint)
- [x] `bunx playwright install chromium` if cache stale

---

## Manual-Only Verifications

| Behavior                                                           | Requirement | Why Manual                                        | Test Instructions                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real Claude.ai / ChatGPT connector connects, consents, calls tools | MCP-10      | Third-party hosted client; cannot be driven in CI | Add custom connector `https://budget-dev.madonzy.com/mcp` in Claude.ai, complete consent, ask it to list budgets and add one transaction, then disconnect in Settings → Connected apps and confirm next call fails |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated gates green 2026-11-07 (15-18 Task 2); manual Claude.ai UAT is 15-18 Task 3.

Gate run 2026-11-07:
- apps/api `test/mcp` + MCP-touched route tests: 170/0
- `packages/identity packages/tenancy packages/platform/test/mcp-repo.test.ts`: 111/0
- `tests/tenant-leak` (the `make ci-gate` test set, run directly, because the runner's `docker compose down` would stop the live dev stack): 90/0
- web Vitest: 3112 passed / 34 skipped / 0 failed
- `@mcp` E2E on https://budget-dev.madonzy.com, chromium + mobile: 10/10, twice
- `bun audit --audit-level=high`: clean · `bunx eslint . --max-warnings=0`: clean
- `make test` set: 2583/2 — both failures are test-order pollution in the shared testcontainer (`No FX rate available for EUR/USD`, `workspaces_slug_unique`); each file passes on its own. The run found 7 real failures first (the demo manifest didn't know the MCP tables or `source`); they were fixed in cb371d0c.
- Pins unchanged: typescript ^5.9.3, next 16.4.2, better-auth 1.7.18
