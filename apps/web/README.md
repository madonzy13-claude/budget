# Budget — Web App (`apps/web`)

Next.js 16 App Router PWA consuming the Hono API at `apps/api`.

## Development

```bash
# From repo root
bun install
```

### Running locally

```bash
# Preferred
bun run --filter=@budget/web dev

# If `bunx next dev` fails under Bun workspaces (Pitfall 7):
# Fall back to:
cd apps/web && npx next dev
# Or:
cd apps/web && bun x --bun next dev
```

### Building

```bash
bun run --filter=@budget/web build
```

## Adding a language (PLAT-06)

1. Create `apps/web/messages/{locale}.json` with the same key structure as `messages/en.json`.
2. Add the locale code to `apps/web/i18n.config.ts`:
   ```ts
   export const locales = ["en", "pl", "uk", "YOUR_LOCALE"] as const;
   ```
3. Run the key-parity check to verify all keys are present:
   ```bash
   node -e "
   const fs=require('fs');
   const flat=(o,p='',r=[])=>{Object.entries(o).forEach(([k,v])=>{const n=p?p+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))flat(v,n,r);else r.push(n)});return r};
   const en=flat(JSON.parse(fs.readFileSync('apps/web/messages/en.json','utf8'))).sort();
   const loc=flat(JSON.parse(fs.readFileSync('apps/web/messages/YOUR_LOCALE.json','utf8'))).sort();
   if(JSON.stringify(en)!==JSON.stringify(loc))throw new Error('Key drift detected');
   console.log('Key parity OK: '+en.length+' keys');
   "
   ```

## Architecture

- **i18n**: `next-intl` with `proxy.ts` (NOT `middleware.ts` — Pitfall 12: Next.js 16 renamed it)
- **API**: Hono RPC client (`hc<AppType>`) — type-only import, no runtime bundle from `apps/api`
- **Auth**: Better Auth client (`createAuthClient`) — cookie-based sessions, never localStorage
- **PWA**: Serwist (`@serwist/next`) — requires Webpack; Turbopack is incompatible (CLAUDE.md)
- **UI**: shadcn/ui new-york preset + Tailwind v4 + Geist Sans/Mono

## Architecture Boundaries (PC-02, PC-15)

`apps/web` MUST NOT import from:

- `packages/*/src/{adapters,domain,application,ports}/`
- `packages/*/dist/`

Allowed imports:

- `apps/api/src/server.ts` — **type-only** (`import type { AppType }`) for Hono RPC typing
- `@budget/shared-kernel` — package root only (shared types like `Locale`)

The dep-cruiser gate (`bunx depcruise --config .dependency-cruiser.cjs apps`) enforces this boundary in CI.
