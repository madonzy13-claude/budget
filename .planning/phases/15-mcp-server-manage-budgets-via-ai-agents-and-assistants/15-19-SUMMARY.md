---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 19
status: complete
---

# 15-19 Summary: public-host routing for MCP

- `apps/web/next.config.mjs` rewrites: `/mcp` → `${apiBase}/mcp`, `/.well-known/:path*` → `${apiBase}/.well-known/:path*`.
- `apps/web/src/middleware.ts` matcher: `/((?!api|auth|mcp|\\.well-known|_next|.*\\..*).*)`.
- `apps/web/sw-offline.ts` `SERVER_DATA_ROUTE` now also covers `/<locale>/oauth/consent` (never cache-served); a budget's own /settings tab stays on the fast path.
- `apps/web/proxy.ts` is dead (src/ dir wins) — left untouched.

## Verification

vitest: middleware-mcp-paths + sw-offline + middleware-locale-precedence 48/48; `tsc --noEmit` clean. Web image not rebuilt yet — done once the consent page (15-09) and Connected apps (15-11) land.
