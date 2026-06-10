---
phase: 01-foundations
plan: 07
plan_id: 01.07
type: execute
wave: 2
depends_on: ["01.00", "01.01", "01.02", "01.04", "01.05", "01.06"]
files_modified:
  - apps/api/package.json
  - apps/api/tsconfig.json
  - apps/api/src/server.ts
  - apps/api/src/boot.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/tenant-guard.ts
  - apps/api/src/middleware/i18n.ts
  - apps/api/src/middleware/error.ts
  - apps/api/src/middleware/rate-limit.ts
  - apps/api/src/routes/auth.ts
  - apps/api/src/routes/workspaces.ts
  - apps/api/src/routes/settings.ts
  - apps/api/src/app.ts
  - apps/api/Dockerfile
  - apps/api/test/middleware/tenant-guard.test.ts
  - apps/api/test/middleware/auth.test.ts
  - apps/api/test/routes/workspaces.test.ts
  - apps/api/locales/en/email.json
  - apps/api/locales/pl/email.json
  - apps/api/locales/uk/email.json
autonomous: true
requirements:
  [TENT-04, TENT-07, TENT-08, TENT-12, IDNT-04, IDNT-06, ENGR-04, ENGR-13]
must_haves:
  truths:
    - "apps/api boots with libsodium ready, env validated, OTel + pino + Sentry init (Phase 6 instruments)"
    - "auth.ts middleware resolves Better Auth session and sets c.session"
    - "tenant-guard.ts middleware reads user_preferences.active_workspace_ids, intersects with actual memberships, sets c.tenantIds + GUC app.tenant_ids"
    - "tenant-guard sets app.current_user_id GUC for user_keys + sessions RLS"
    - "tenant-guard query relies on Plan 06's workspace_members_self policy (PC-01) — that policy NOW EXISTS in Plan 06 schema (workspace_members_self)"
    - "i18n.ts middleware reads users.locale and sets c.locale"
    - "error.ts middleware converts Result<_, Error> → HTTP responses (4xx for known domain errors, 500 for unknown)"
    - "rate-limit.ts: 1/min cooldown for verification email resend (D-13)"
    - "Hono RPC routes: /auth/* (Better Auth), /workspaces/*, /settings/*"
    - "Workspaces routes return Hono RPC contracts importable by apps/web (Hono RPC client)"
    - "Worker job context propagation: handlers wrap dispatchOutboxBatch in withTenantTx using payload.tenantIds (D-10)"
    - "PC-02 + PC-15: boot.ts imports ONLY from package roots (@budget/identity, @budget/tenancy, etc.) — never from /dist/ or src/adapters/. Apps consume via createIdentityModule() / createTenancyModule() factories"
  artifacts:
    - path: apps/api/src/middleware/auth.ts
      provides: "Better Auth session resolver"
      contains: "auth.api.getSession"
    - path: apps/api/src/middleware/tenant-guard.ts
      provides: "active_workspace_ids resolver + intersection + GUC set"
      contains: "active_workspace_ids"
    - path: apps/api/src/server.ts
      provides: "Hono app entrypoint exporting AppType for RPC client"
      contains: "export type AppType"
    - path: apps/api/src/middleware/i18n.ts
      provides: "Locale resolution from session.user.locale"
      contains: "locale"
  key_links:
    - from: "apps/api/src/middleware/tenant-guard.ts"
      to: "identity.user_preferences (active_workspace_ids) + tenancy.workspace_members_self policy (PC-01)"
      via: "appPool query + intersection"
      pattern: "active_workspace_ids"
    - from: "apps/api/src/server.ts"
      to: "apps/web (Hono RPC client)"
      via: "export type AppType = typeof app"
      pattern: "AppType"
    - from: "apps/api/src/boot.ts"
      to: "@budget/identity + @budget/tenancy package roots"
      via: "createIdentityModule + createTenancyModule (PC-02, PC-15 — never /dist/ or src/adapters/)"
      pattern: "createIdentityModule"
---

<objective>
Wire the API surfaces — Better Auth handler mount, tenant-guard middleware (D-08 GUC array), i18n middleware, error middleware, and the route table for /auth, /workspaces, /settings.

Purpose: D-08 (GUC), D-10 (worker tenant propagation), TENT-04/07/08/12, IDNT-04/06, ENGR-04. apps/api is what apps/web (Plan 08) talks to via Hono RPC; this plan ships the connection between the contexts wired in Plans 5+6 and the HTTP surface.

PC-02 + PC-15 boundary: boot.ts uses `createIdentityModule()` and `createTenancyModule()` factories from package roots — `import { createIdentityModule } from '@budget/identity'`. NEVER reach into `/dist/` or `src/adapters/persistence/...`. dep-cruiser rule `apps-only-public-package-surface` (Plan 00) enforces.

PC-01: tenant-guard's bootstrap query relies on the `workspace_members_self` policy added in Plan 06. That policy NOW EXISTS in Plan 06's schema — this plan removes the previous "if not yet present" hedge and depends on it as a hard prerequisite.

Output: A `apps/api` Bun service that mounts Better Auth, runs the active_workspace_ids → GUC pipeline on every request, and exposes Hono RPC type-safe routes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-foundations/01-CONTEXT.md
@.planning/phases/01-foundations/01-RESEARCH.md
@.planning/phases/01-foundations/01-VALIDATION.md
@CLAUDE.md
@packages/identity/src/index.ts
@packages/tenancy/src/index.ts
@packages/platform/src/index.ts
@packages/shared-kernel/src/index.ts

<interfaces>
<!-- apps/api exports its AppType for apps/web Hono RPC client -->

import type { Hono } from 'hono';
export type AppType = typeof app;

<!-- Hono context augmentation -->

declare module 'hono' {
interface ContextVariableMap {
session: { user: { id: string; email: string; locale: 'en'|'pl'|'uk' } } | null;
tenantIds: string[];
locale: 'en' | 'pl' | 'uk';
}
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: apps/api boot + middleware stack (auth, tenant-guard, i18n, error, rate-limit) — PC-02/PC-15 imports via package roots</name>
  <files>
    apps/api/package.json,
    apps/api/tsconfig.json,
    apps/api/src/boot.ts,
    apps/api/src/middleware/auth.ts,
    apps/api/src/middleware/tenant-guard.ts,
    apps/api/src/middleware/i18n.ts,
    apps/api/src/middleware/error.ts,
    apps/api/src/middleware/rate-limit.ts,
    apps/api/test/middleware/tenant-guard.test.ts,
    apps/api/test/middleware/auth.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"System Architecture Diagram" (lines 254-316) — middleware order
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 4: Active-workspace multi-select → GUC array" (lines 649-676)
    - .planning/phases/01-foundations/01-CONTEXT.md D-07, D-08, D-10
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 4 (SET LOCAL only inside tx)
    - packages/identity/src/index.ts (createIdentityModule factory — PC-02 surface)
    - packages/tenancy/src/index.ts (createTenancyModule factory — PC-02 surface)
    - packages/tenancy/src/adapters/persistence/schema.ts (PC-01: workspace_members_self policy is DEFINED HERE — this plan depends on it as a hard prerequisite, not "if not yet present")
    - packages/platform/src/crypto/dek-context.ts (AsyncLocalStorage DEK cache)
  </read_first>
  <behavior>
    - boot.ts: loadEnv() → libsodiumReady() → init pino root logger → init OpenTelemetry SDK (no-op exporter Phase 1) → instantiate identity + tenancy modules via package-root factories (PC-02, PC-15) → return resolved deps
    - auth.ts: c.set('session', await auth.api.getSession({ headers: c.req.raw.headers }) ?? null); next()
    - tenant-guard.ts:
      1. const session = c.get('session'); if !session → c.set('tenantIds', []); next()
      2. Open a pg client; BEGIN; SET LOCAL app.current_user_id = $userId (Pitfall 4 — SET LOCAL inside tx)
      3. Run intersection query (PC-01: relies on workspace_members_self policy which Plan 06 schema now defines):
         ```sql
         SELECT array_agg(wm.workspace_id::text) AS ids
           FROM identity.user_preferences up
           JOIN tenancy.workspace_members wm ON wm.user_id = up.user_id
          WHERE up.user_id = $1
            AND wm.workspace_id = ANY(up.active_workspace_ids)
         ```
         The workspace_members_self policy permits the user to SELECT their own membership rows even before app.tenant_ids is set.
      4. COMMIT; c.set('tenantIds', resolvedTenantIds)
      5. The HANDLER (in routes/) wraps its DB calls in withTenantTx(tenantIds[0], userId) — middleware resolves the array, handler opens the actual writable tx
    - i18n.ts: c.set('locale', c.get('session')?.user?.locale ?? 'en')
    - error.ts: catches thrown errors, logs via pino, returns appropriate HTTP status
    - rate-limit.ts: simple in-memory map keyed by IP+endpoint+userId; resend-verification limited to 1/min per user (D-13)
  </behavior>
  <action>
    1. Add to `apps/api/package.json`:
       ```json
       "dependencies": {
         "@budget/shared-kernel": "workspace:*",
         "@budget/platform": "workspace:*",
         "@budget/identity": "workspace:*",
         "@budget/tenancy": "workspace:*",
         "hono": "^4.12.16",
         "@hono/zod-validator": "^0.7.6",
         "@hono/zod-openapi": "^1.3.0",
         "zod": "^4.4.3",
         "pino": "^9.0.0",
         "@opentelemetry/sdk-node": "latest",
         "@opentelemetry/auto-instrumentations-node": "latest"
       },
       "scripts": { "dev": "bun --hot run src/server.ts", "start": "bun run src/server.ts", "test": "bun test", "typecheck": "tsc --noEmit -p tsconfig.json" }
       ```
    2. Create `apps/api/tsconfig.json` extending `../../tsconfig.base.json`.
    3. Implement `apps/api/src/boot.ts` (PC-02 + PC-15: imports via package ROOTS — never /dist/ or /src/adapters/):
       ```ts
       import { loadEnv, StdoutEmailSender } from '@budget/shared-kernel';
       import { libsodiumReady, LibsodiumKeyStore } from '@budget/platform';
       import { createIdentityModule } from '@budget/identity';      // PC-02, PC-15
       import { createTenancyModule } from '@budget/tenancy';        // PC-02, PC-15
       import pino from 'pino';

       export interface BootedDeps {
         env: ReturnType<typeof loadEnv>;
         logger: ReturnType<typeof pino>;
         keyStore: LibsodiumKeyStore;
         emailSender: StdoutEmailSender;
         identity: ReturnType<typeof createIdentityModule>;
         tenancy: ReturnType<typeof createTenancyModule>;
       }

       export async function boot(): Promise<BootedDeps> {
         const env = loadEnv();
         await libsodiumReady();
         const logger = pino({ level: env.LOG_LEVEL });
         const keyStore = new LibsodiumKeyStore();
         const emailSender = new StdoutEmailSender();
         // Build the tenancy module first (its organizationPlugin gets injected into identity)
         const tenancy = createTenancyModule({ emailSender, appUrl: env.APP_URL });
         const identity = createIdentityModule({
           emailSender,
           keyStore,
           additionalPlugins: [tenancy.organizationPlugin],
         });
         logger.info({ region: env.REGION }, 'apps/api booted');
         return { env, logger, keyStore, emailSender, identity, tenancy };
       }
       ```
    4. Implement `apps/api/src/middleware/auth.ts`:
       ```ts
       import type { MiddlewareHandler } from 'hono';
       import type { BootedDeps } from '../boot';
       export const authMiddleware = (deps: BootedDeps): MiddlewareHandler => async (c, next) => {
         const session = await (deps.identity.auth as any).api.getSession({ headers: c.req.raw.headers });
         c.set('session', session ?? null);
         await next();
       };
       ```
    5. Implement `apps/api/src/middleware/tenant-guard.ts` (PC-01: relies on workspace_members_self policy from Plan 06):
       ```ts
       import type { MiddlewareHandler } from 'hono';
       import { sql } from 'drizzle-orm';
       import { appPool } from '@budget/platform';

       export const tenantGuard: MiddlewareHandler = async (c, next) => {
         const session = c.get('session');
         if (!session) { c.set('tenantIds', []); await next(); return; }
         const userId = session.user.id;
         const client = await appPool().connect();
         try {
           // Pitfall 4: SET LOCAL only inside an explicit transaction
           await client.query('BEGIN');
           await client.query(`SET LOCAL app.current_user_id = $1`, [userId]);
           // PC-01: intersection query relies on Plan 06's workspace_members_self policy.
           // That policy is now DEFINED in tenancy.workspace_members and lets users SELECT
           // their own membership rows when only app.current_user_id is set (no app.tenant_ids).
           const r = await client.query(
             `SELECT array_agg(wm.workspace_id::text) AS ids
                FROM identity.user_preferences up
                JOIN tenancy.workspace_members wm ON wm.user_id = up.user_id
               WHERE up.user_id = $1
                 AND wm.workspace_id = ANY(up.active_workspace_ids)`,
             [userId],
           );
           await client.query('COMMIT');
           const ids = (r.rows[0]?.ids as string[] | null) ?? [];
           c.set('tenantIds', ids);
         } catch (e) {
           await client.query('ROLLBACK').catch(() => {});
           throw e;
         } finally { client.release(); }
         await next();
       };
       ```
    6. Implement `apps/api/src/middleware/i18n.ts`:
       ```ts
       import type { MiddlewareHandler } from 'hono';
       export const i18nMiddleware: MiddlewareHandler = async (c, next) => {
         const session = c.get('session');
         const locale = (session?.user as { locale?: 'en'|'pl'|'uk' } | undefined)?.locale ?? 'en';
         c.set('locale', locale);
         await next();
       };
       ```
    7. Implement `apps/api/src/middleware/error.ts`:
       ```ts
       import type { MiddlewareHandler } from 'hono';
       import { HTTPException } from 'hono/http-exception';
       export const errorMiddleware: MiddlewareHandler = async (c, next) => {
         try { await next(); }
         catch (e) {
           if (e instanceof HTTPException) throw e;
           const msg = (e as Error).message ?? 'unknown';
           if (/PRIVATE workspaces/.test(msg)) throw new HTTPException(409, { message: msg });
           if (/default_currency is immutable/.test(msg)) throw new HTTPException(409, { message: msg });
           if (/Cannot leave as last owner/.test(msg)) throw new HTTPException(409, { message: msg });
           if (/Invalid locale|Invalid ISO-4217/.test(msg)) throw new HTTPException(400, { message: msg });
           if (/^Verify your email/.test(msg)) throw new HTTPException(403, { message: msg });
           console.error('[api] unhandled error', e);
           throw new HTTPException(500, { message: 'internal error' });
         }
       };
       ```
    8. Implement `apps/api/src/middleware/rate-limit.ts` — simple in-memory window keyed by `${userId}:${endpoint}`. Public methods: `checkAndRecord(key, windowSec, max): boolean`. Use for `/auth/resend-verification` at 1/min per user (D-13).
    9. WRITE TESTS for tenant-guard.test.ts (asserts intersection logic with mock session) and auth.test.ts (asserts session resolution from cookie).

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p apps/api/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err apps/api && ! grep -F '/dist/' apps/api/src/boot.ts && ! grep -F 'src/adapters/persistence' apps/api/src/boot.ts</automated>
  </verify>
  <acceptance_criteria>
    - boot.ts calls libsodiumReady: `grep -F 'libsodiumReady' apps/api/src/boot.ts` exits 0
    - boot.ts loads env: `grep -F 'loadEnv()' apps/api/src/boot.ts` exits 0
    - PC-02 + PC-15: boot.ts imports createIdentityModule from package root (not /dist/, not src/adapters/): `grep -F "from '@budget/identity'" apps/api/src/boot.ts && grep -F 'createIdentityModule' apps/api/src/boot.ts && ! grep -F '/dist/' apps/api/src/boot.ts && ! grep -F "from '@budget/identity/dist/" apps/api/src/boot.ts && ! grep -F "from '@budget/identity/src/" apps/api/src/boot.ts` exits 0
    - PC-02 + PC-15: boot.ts imports createTenancyModule from package root: `grep -F "from '@budget/tenancy'" apps/api/src/boot.ts && grep -F 'createTenancyModule' apps/api/src/boot.ts && ! grep -F "from '@budget/tenancy/dist/" apps/api/src/boot.ts && ! grep -F "from '@budget/tenancy/src/" apps/api/src/boot.ts` exits 0
    - boot.ts wires identity with tenancy.organizationPlugin: `grep -F 'tenancy.organizationPlugin' apps/api/src/boot.ts` exits 0
    - tenant-guard.ts intersects active_workspace_ids with memberships: `grep -F 'active_workspace_ids' apps/api/src/middleware/tenant-guard.ts && grep -F 'workspace_members' apps/api/src/middleware/tenant-guard.ts` exits 0
    - tenant-guard sets app.current_user_id: `grep -F 'app.current_user_id' apps/api/src/middleware/tenant-guard.ts` exits 0
    - tenant-guard uses BEGIN/COMMIT: `grep -F 'BEGIN' apps/api/src/middleware/tenant-guard.ts && grep -F 'COMMIT' apps/api/src/middleware/tenant-guard.ts` exits 0
    - tenant-guard read_first comment references PC-01 workspace_members_self policy: `grep -F 'workspace_members_self' apps/api/src/middleware/tenant-guard.ts || grep -F 'PC-01' apps/api/src/middleware/tenant-guard.ts` exits 0
    - error.ts maps known domain errors to status codes: `grep -F 'HTTPException(409' apps/api/src/middleware/error.ts && grep -F 'HTTPException(400' apps/api/src/middleware/error.ts` exits 0
    - rate-limit middleware exists: `test -f apps/api/src/middleware/rate-limit.ts` exits 0
    - i18n middleware reads session locale: `grep -F 'session?.user' apps/api/src/middleware/i18n.ts` exits 0
    - tsc + dep-cruiser pass
  </acceptance_criteria>
  <done>Boot + 5 middleware ready. Hono context vars typed. Pre-flight pipeline: env validation → sodium ready → logger → auth → tenant-guard → i18n → error. PC-02/PC-15: imports go through package roots only. PC-01: tenant-guard's intersection query depends on the workspace_members_self policy now defined in Plan 06's schema.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Routes (auth mount, workspaces, settings) + AppType export for Hono RPC</name>
  <files>
    apps/api/src/routes/auth.ts,
    apps/api/src/routes/workspaces.ts,
    apps/api/src/routes/settings.ts,
    apps/api/src/app.ts,
    apps/api/src/server.ts,
    apps/api/test/routes/workspaces.test.ts,
    apps/api/locales/en/email.json,
    apps/api/locales/pl/email.json,
    apps/api/locales/uk/email.json,
    apps/api/Dockerfile
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Project Structure" apps/api/src/routes/* (lines 333-342)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 3" sendInvitationEmail format (template names)
    - packages/tenancy/src/application/* (factory functions used by routes)
    - packages/identity/src/application/* (factory functions used by /settings routes)
  </read_first>
  <behavior>
    - /auth/* mounted via Better Auth handler; routes for sign-up, sign-in, sign-out, verify-email (callback), reset-password handled by Better Auth itself
    - /workspaces routes:
      - POST /workspaces { name, kind, default_currency } → createWorkspace
      - POST /workspaces/:id/invitations { email } → inviteMember
      - POST /workspaces/:id/leave → leaveWorkspace
      - POST /workspaces/:id/transfer-ownership { toUserId }
      - PUT /workspaces/:id/shares { shares: [{ userId, percentage }] } → updateShares
      - GET /workspaces/active → listActiveWorkspaces
      - PUT /workspaces/active { workspaceIds } → setActiveWorkspaces
    - /settings:
      - PUT /settings/locale { locale }
      - PUT /settings/display-currency { currency }
      - PUT /settings/provider-prefs { llm?, stt? }
      - GET /settings/sessions → listSessions
      - DELETE /settings/sessions/:id → revokeSession
    - All routes use @hono/zod-validator for request validation
    - app.ts composes: app.use(errorMiddleware) → app.route('/auth', ...) → app.use(authMiddleware) → app.use(tenantGuard) → app.use(i18nMiddleware) → mount routes
    - server.ts exports AppType
    - locales/{en,pl,uk}/email.json: minimal email templates (verify-email, reset-password, workspace-invite) per D-29
  </behavior>
  <action>
    1. Implement `apps/api/src/routes/auth.ts` — mounts Better Auth handler:
       ```ts
       import { Hono } from 'hono';
       import type { BootedDeps } from '../boot';
       export function authRoutes(deps: BootedDeps) {
         const r = new Hono();
         r.all('/*', async (c) => (deps.identity.auth as any).handler(c.req.raw));
         return r;
       }
       ```
    2. Implement `apps/api/src/routes/workspaces.ts` with all 7 endpoints. Each handler:
       - Reads c.get('session') — 401 if missing
       - Validates body with zod via @hono/zod-validator
       - Calls the matching application service from packages/tenancy
       - Returns Result.value via c.json or rethrows error to errorMiddleware
       Example for POST /workspaces:
       ```ts
       import { Hono } from 'hono';
       import { z } from 'zod';
       import { zValidator } from '@hono/zod-validator';
       // PC-02: import application services via the factory or thin wrappers — apps may also
       // call deps.tenancy.workspaceRepo / .memberShareRepo from the factory output.
       // For one-shot application services we import from the package's contracts surface only.

       export function workspacesRoutesFactory(deps: any) {
         const r = new Hono();
         const createSchema = z.object({ name: z.string().min(1).max(100), kind: z.enum(['PRIVATE','SHARED']), default_currency: z.string().regex(/^[A-Z]{3}$/) });
         r.post('/', zValidator('json', createSchema), async (c) => {
           const session = c.get('session'); if (!session) return c.json({ error: 'unauthorized' }, 401);
           const body = c.req.valid('json');
           // call application service; handler details follow Plan 06 service signatures
           // (omitted for brevity — see Plan 06 Task 4)
           return c.json({ ok: true }, 201);
         });
         // ... 6 more handlers
         return r;
       }
       ```
    3. Implement `apps/api/src/routes/settings.ts` similarly with 5 endpoints.
    4. Implement `apps/api/src/app.ts`:
       ```ts
       import { Hono } from 'hono';
       import { errorMiddleware } from './middleware/error';
       import { authMiddleware } from './middleware/auth';
       import { tenantGuard } from './middleware/tenant-guard';
       import { i18nMiddleware } from './middleware/i18n';
       import { authRoutes } from './routes/auth';
       import { workspacesRoutesFactory } from './routes/workspaces';
       import { settingsRoutesFactory } from './routes/settings';
       import type { BootedDeps } from './boot';

       export function createApp(deps: BootedDeps) {
         const app = new Hono();
         app.use(errorMiddleware);
         app.route('/auth', authRoutes(deps));
         app.use(authMiddleware(deps));
         app.use(tenantGuard);
         app.use(i18nMiddleware);
         app.route('/workspaces', workspacesRoutesFactory(deps));
         app.route('/settings', settingsRoutesFactory(deps));
         app.get('/health', (c) => c.json({ ok: true, region: deps.env.REGION }));
         return app;
       }
       export type AppType = ReturnType<typeof createApp>;
       ```
    5. Implement `apps/api/src/server.ts`:
       ```ts
       import { boot } from './boot';
       import { createApp, type AppType } from './app';

       const deps = await boot();
       const app = createApp(deps);
       export { app };
       export type { AppType };
       export default { fetch: app.fetch, port: 4000 };
       ```
    6. Create `apps/api/locales/en/email.json`:
       ```json
       {
         "verify-email": { "subject": "Verify your Budget account", "body": "Click to verify: {{url}}\n\nThis link works for 24 hours." },
         "reset-password": { "subject": "Reset your Budget password", "body": "Click to reset: {{url}}\n\nThis link works for 30 minutes." },
         "workspace-invite": { "subject": "{{inviter}} invited you to {{workspace}}", "body": "Click to accept: {{url}}" }
       }
       ```
       And `pl/email.json` + `uk/email.json` with same key structure.
    7. Create `apps/api/Dockerfile` (multi-stage Bun, mirrors apps/worker):
       ```dockerfile
       FROM oven/bun:1.3 AS deps
       WORKDIR /app
       COPY package.json bun.lockb ./
       COPY apps/api/package.json apps/api/
       COPY packages/*/package.json packages/
       RUN bun install --frozen-lockfile

       FROM oven/bun:1.3
       WORKDIR /app
       COPY --from=deps /app/node_modules ./node_modules
       COPY . .
       WORKDIR /app/apps/api
       EXPOSE 4000
       HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD bun -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
       CMD ["bun", "run", "src/server.ts"]
       ```
    8. WRITE `apps/api/test/routes/workspaces.test.ts` — minimal smoke that POST /workspaces with valid body returns 201, missing session returns 401, kind=invalid returns 400 (zod validation).

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p apps/api/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err apps/api && bun test apps/api/test/</automated>
  </verify>
  <acceptance_criteria>
    - server.ts exports AppType: `grep -F 'export type { AppType }' apps/api/src/server.ts` exits 0
    - app.ts mounts /auth, /workspaces, /settings, /health: `for r in /auth /workspaces /settings /health; do grep -F "$r" apps/api/src/app.ts; done` exits 0
    - workspaces routes use zod validator: `grep -F '@hono/zod-validator' apps/api/src/routes/workspaces.ts` exits 0
    - settings routes have 5 endpoints: `grep -E '(locale|display-currency|provider-prefs|sessions)' apps/api/src/routes/settings.ts | wc -l` returns at least 5
    - All 3 locale email catalogs exist: `for l in en pl uk; do test -f apps/api/locales/${l}/email.json; done` exits 0
    - Email JSON has same keys (parity check): `for l in en pl uk; do jq -r 'keys[]' apps/api/locales/${l}/email.json | sort; done | sort -u | wc -l` returns 3
    - Dockerfile exists with healthcheck: `grep -F 'HEALTHCHECK' apps/api/Dockerfile` exits 0
    - tsc passes; dep-cruiser passes
  </acceptance_criteria>
  <done>Hono RPC API surfaces shipped: /auth (Better Auth handler), /workspaces (7 endpoints), /settings (5 endpoints), /health. AppType exported for apps/web RPC client. Email catalogs in 3 locales.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                   | Description                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP request → API handler | Cookie session resolution → tenant-guard intersection → GUC set per request                                                                                       |
| Body → handler             | zod validation enforces shape before reaching application services                                                                                                |
| Session → tenantIds        | Defense in depth: client-supplied active_workspace_ids never trusted; server intersects with actual memberships                                                   |
| apps/api → packages/\*     | PC-02: imports via package roots only (createIdentityModule, createTenancyModule); dep-cruiser bans reaching into adapters/_ / domain/_ / application/_ / ports/_ |

## STRIDE Threat Register

| Threat ID  | Category               | Component                                                                | Disposition      | Mitigation Plan                                                                                                                                                                   |
| ---------- | ---------------------- | ------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01-07-01 | Information Disclosure | Reading active_workspace_ids from cookie/session (user-controllable)     | mitigate         | tenant-guard reads exclusively from `identity.user_preferences` (server-side persisted); intersects with `tenancy.workspace_members` on every request — never trusts client claim |
| T-01-07-02 | Information Disclosure | Tenant context leak between requests via SET (without LOCAL) (Pitfall 4) | mitigate         | tenant-guard wraps SET LOCAL in BEGIN/COMMIT; for handler queries, withTenantTx (PC-03 extended signature) provides the wrap                                                      |
| T-01-07-03 | Tampering              | CSRF on state-changing endpoints                                         | mitigate         | Better Auth issues SameSite=Lax cookies; non-GET state-changing endpoints accept JSON body which double-protects against form-CSRF; explicit Origin check is Phase 6 hardening    |
| T-01-07-04 | Spoofing               | Verification email resend abuse                                          | mitigate         | rate-limit middleware enforces 1/min per user/IP on /auth/resend-verification (D-13)                                                                                              |
| T-01-07-05 | Elevation of Privilege | Member calling owner-only endpoints                                      | mitigate         | Application services in packages/tenancy check role server-side; routes also rely on RLS to filter visible workspaces                                                             |
| T-01-07-06 | Tampering              | Mass-assignment via JSON body                                            | mitigate         | zValidator on every state-changing endpoint with explicit zod schema                                                                                                              |
| T-01-07-07 | Information Disclosure | Verbose error messages leaking internal structure                        | mitigate         | error.ts maps domain errors to user-facing 4xx with i18n-keyed messages                                                                                                           |
| T-01-07-08 | Repudiation            | API actions not audit-tracked                                            | partial mitigate | Plan 06's update-shares writes audit_history; Phase 1 does NOT audit every action                                                                                                 |
| T-01-07-09 | Tampering              | Apps reaching into package internals (PC-02 violation)                   | mitigate         | dep-cruiser rule `apps-only-public-package-surface` (Plan 00) bans apps/\*_ → packages/_/src/{adapters,application,domain,ports}; CI fails closed                                 |

</threat_model>

<verification>
```bash
cd /home/claude/budget
bunx tsc --noEmit -p apps/api/tsconfig.json
bunx depcruise --config .dependency-cruiser.cjs --output-type err apps/api
bun test apps/api/test/
for l in en pl uk; do jq empty apps/api/locales/${l}/email.json; done
! grep -F '/dist/' apps/api/src/boot.ts
! grep -F 'src/adapters/persistence' apps/api/src/boot.ts
```
All exit 0.
</verification>

<success_criteria>

- apps/api boots with libsodium ready, env validated, OTel + pino init
- 5 middleware: error, auth (Better Auth session), tenant-guard (active_workspace_ids → GUC), i18n (locale), rate-limit
- /auth Better Auth handler mounted; /workspaces (7 endpoints), /settings (5 endpoints), /health
- AppType exported for Hono RPC client (apps/web)
- 3 locale email catalogs (en/pl/uk) with parity
- Dockerfile + healthcheck
- PC-02 + PC-15: boot.ts imports via package roots only (createIdentityModule, createTenancyModule); no /dist/ or /src/adapters/
- PC-01: tenant-guard intersection query depends on Plan 06's workspace_members_self policy (now DEFINED — no "if not yet present" hedge)
  </success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-07-SUMMARY.md`
</output>
