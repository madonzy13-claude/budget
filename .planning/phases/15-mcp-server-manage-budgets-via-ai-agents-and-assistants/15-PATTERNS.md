# Phase 15: MCP server - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 22 new/modified
**Analogs found:** 20 / 22 (2 partial, see "No Analog Found")

Line numbers refer to the working tree at mapping time. Re-grep before quoting if the file has since changed.

## File Classification

| New/Modified File                                                                                                                       | Role                      | Data Flow        | Closest Analog                                                             | Match                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------- | -------------------------------------------------------------------------- | ------------------------------ |
| `packages/identity/src/adapters/persistence/better-auth.ts` (add `jwt`/`oauthProvider` wiring, extend `TENANT_TABLES`/user-level purge) | config / auth             | request-response | itself + `apps/api/src/boot.ts:263`                                        | exact                          |
| `packages/identity/src/adapters/persistence/oauth-schema.ts` (8 Drizzle tables, `identity` schema)                                      | model                     | CRUD             | `packages/identity/src/adapters/persistence/schema.ts` (`sessions`)        | exact                          |
| `apps/api/src/boot.ts` (add plugins + `additionalSchema`)                                                                               | config                    | wiring           | `boot.ts:259-266`                                                          | exact                          |
| `drizzle/0106_mcp_oauth.sql` + `drizzle/meta/_journal.json` entry                                                                       | migration                 | DDL              | `0103_better_auth_17_columns.sql`, `0032_phase08_push.sql`                 | exact                          |
| `apps/migrator/post-migration.sql` (grants, FORCE RLS, OAuth table policies, `UPDATE (reverted_at)` grant)                              | migration                 | DDL              | `post-migration.sql:24-25`, `:752-785`, `:140-160`                         | exact                          |
| `packages/platform/src/mcp/schema.ts` (`mcp_write_log`, `mcp_import_previews`)                                                          | model                     | CRUD             | `packages/platform/src/audit/schema.ts`, `idempotency/schema.ts`           | exact                          |
| `packages/platform/src/mcp/repo.ts` (+ `index.ts`, export from `platform/src/index.ts`)                                                 | repo                      | CRUD             | `packages/platform/src/idempotency/repo.ts`                                | exact                          |
| `apps/api/src/mcp/handler.ts` (`/mcp` route, bearer verify, 401 challenge)                                                              | controller                | request-response | `apps/api/src/routes/auth.ts` (pass-through) + `middleware/auth.ts`        | role-match                     |
| `apps/api/src/mcp/well-known.ts` (`/.well-known/*`)                                                                                     | route                     | request-response | `apps/api/src/routes/auth.ts`                                              | role-match                     |
| `apps/api/src/mcp/dispatch.ts` + `authMiddleware` internal branch                                                                       | middleware / utility      | request-response | `apps/api/src/middleware/auth.ts`                                          | role-match                     |
| `apps/api/src/mcp/limits.ts`                                                                                                            | middleware                | request-response | `apps/api/src/middleware/rate-limit.ts`                                    | exact                          |
| `apps/api/src/mcp/tools/{read,write,import,undo}.ts`, `server.ts`, `prompts.ts`, `money.ts`                                             | service (driving adapter) | request-response | `apps/api/src/routes/transactions.ts`, `wallets.ts` (routes being wrapped) | role-match                     |
| `apps/api/src/app.ts` (mount `/mcp`, `/.well-known`)                                                                                    | config                    | wiring           | `app.ts:60-93`                                                             | exact                          |
| `apps/api/test/routes/mcp*.test.ts`, route-coverage-audit entry                                                                         | test                      | request-response | `apps/api/test/routes/push.test.ts`, `route-coverage-audit.test.ts`        | exact                          |
| `packages/identity/test/*oauth*.test.ts` + `account-deletion-cascade.test.ts` extension                                                 | test                      | CRUD             | `packages/identity/test/account-deletion-cascade.test.ts`                  | exact                          |
| `apps/web/next.config.mjs` (rewrites)                                                                                                   | config                    | request-response | `next.config.mjs:60-72`                                                    | exact                          |
| `apps/web/proxy.ts` (matcher)                                                                                                           | config                    | request-response | itself                                                                     | exact                          |
| `apps/web/src/app/[locale]/oauth/consent/page.tsx`                                                                                      | component (page)          | request-response | `apps/web/src/app/[locale]/sign-in/page.tsx`                               | role-match                     |
| `apps/web/src/components/settings/connected-apps-section.tsx` + shell edit                                                              | component                 | CRUD             | `components/settings/sessions-list.tsx`, `user-settings-shell.tsx`         | exact                          |
| `apps/web/messages/{en,pl,uk}.json`                                                                                                     | config                    | static           | existing `settings.sessions` namespace                                     | exact                          |
| `apps/web/e2e/features/connected-apps.feature`, `steps/connected-apps.steps.ts`, `page-objects/ConnectedAppsPo.ts`                      | test (E2E)                | request-response | `settings-security.feature` + steps, `SettingsPo.ts`                       | exact                          |
| `apps/web/e2e/fixtures/cleanup-fixture-data.ts` (add new tables)                                                                        | test util                 | batch            | itself `:31-54`                                                            | exact                          |
| Dockerfiles                                                                                                                             | config                    | build            | see Shared Patterns                                                        | n/a (no new workspace package) |

## Pattern Assignments

### Better Auth plugin wiring

**Analog:** `apps/api/src/boot.ts:259-266` (+ `packages/tenancy/src/contracts/factory.ts:44-52` for schema contract)

```typescript
const identity = createIdentityModule({
  emailSender,
  keyStore,
  additionalPlugins: [tenancy.organizationPlugin],
  additionalSchema: tenancy.betterAuthSchema,
});
```

```typescript
// factory.ts:44-52 — additionalSchema is a flat map keyed by Better Auth MODEL name
betterAuthSchema: {
  budgets: tenancySchema.budgets,
  budget_members: tenancySchema.budgetMembers,
  budget_invitations: tenancySchema.budgetInvitations,
},
```

Copy: add `jwt()` and `oauthProvider({...})` to `additionalPlugins`; spread an `oauthBetterAuthSchema` (keys = the model names the plugin declares: `oauthClient`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`, `oauthResource`, `oauthClientResource`, `oauthClientAssertion`, `jwks`) into `additionalSchema`. Check the exact key names by running `bunx @better-auth/cli generate` in the scratchpad. 1.7.x refuses sign-up on any missing column (migration 0103 incident).

`createAuth` constants to remember (`better-auth.ts:259-285`): `drizzle(betterAuthPool(), { casing: "snake_case" })`, `usePlural: false`, `basePath: "/auth"`, `advanced.database.generateId = () => crypto.randomUUID()` (so every id column the plugin owns must be `uuid` or the cast fails), `plugins: opts.additionalPlugins ?? []` (`:536`). `rateLimit.customRules` (`:538-560`) is the place to add per-path limits for `/oauth2/register` and `/oauth2/token` if the plugin's own `rateLimit` option is insufficient.

`apps/api/src/routes/auth.ts` already mounts `deps.identity.auth.handler` at `/auth/*`, so the OAuth endpoints appear at `/auth/oauth2/*` with no route change.

---

### Drizzle schema for the 8 OAuth tables

**Analog:** `packages/identity/src/adapters/persistence/schema.ts` (`sessions`, lines 83-120)

**Imports** (lines 1-11):

```typescript
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  boolean,
  timestamp,
  customType,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { identity, appRole, workerRole } from "@budget/platform";
```

**Table pattern:** `identity.table("sessions", { id: text("id").primaryKey(), userId: uuid("user_id").notNull(), ..., createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [pgPolicy(...)])`.
Note `sessions.id` is `text`, `users.id` is `uuid`. Match what the generated reference says per column. Reuse `sessionsInsertOpen` style policy `for: "insert", withCheck: sql\`true\``. Canonical SELECT/UPDATE/DELETE policies are overridden in `post-migration.sql`(comment at`schema.ts:105-107`), so put real policy truth there, not here.

---

### Hand-authored migration `drizzle/0106_mcp_oauth.sql`

**Analogs:** `drizzle/0103_better_auth_17_columns.sql` (small, idempotent), `drizzle/0032_phase08_push.sql` (new `shared_kernel` tables with RLS)

Conventions:

- Header comment explaining WHY (see 0103/0105).
- Statements separated by `--> statement-breakpoint`.
- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- Tenant RLS policy text to copy verbatim (`0032:55-60`):

```sql
ALTER TABLE shared_kernel.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_kernel.push_subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_tenant_isolation ON shared_kernel.push_subscriptions;
CREATE POLICY push_subscriptions_tenant_isolation
  ON shared_kernel.push_subscriptions
  AS PERMISSIVE FOR ALL
  TO app_role, worker_role
  USING   (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
```

**Journal registration (hand-authored SQL MUST be listed)** — append to `drizzle/meta/_journal.json` after idx 105 (`when` strictly increasing, last is `1783750000000`):

```json
{
  "idx": 106,
  "version": "7",
  "when": 1783760000000,
  "tag": "0106_mcp_oauth",
  "breakpoints": true
}
```

Last migration on disk is `0105_limit_converted_from`, so 0106 is next. Dropping `_journal.json` registration means `make migrate` silently skips it.

**Caution (memory: migration RLS data loss):** FORCE RLS on a JOINed table silences INSERT. Do not add FORCE RLS to OAuth tables without a Better-Auth-pool policy (see next section).

---

### `post-migration.sql` additions

**Analog:** `apps/migrator/post-migration.sql`

Two patterns to copy.

1. Tenant table grants + FORCE RLS (lines 24-25, 757-760):

```sql
GRANT SELECT, INSERT ON shared_kernel.audit_history TO app_role, worker_role;
ALTER TABLE shared_kernel.audit_history FORCE ROW LEVEL SECURITY;
```

For `mcp_write_log`: `GRANT SELECT, INSERT ON ... TO app_role;` then `GRANT UPDATE (reverted_at) ON shared_kernel.mcp_write_log TO app_role;` here, NOT in the migration, because post-migration REVOKEs wipe column grants (memory: post-migration REVOKE wipes column grants; precedent `post-migration.sql:702` "column-level GRANT UPDATE on editable expense_ledger columns"). `mcp_import_previews`: `SELECT, INSERT, DELETE`. Re-state the policy with `DROP POLICY IF EXISTS ... CREATE POLICY ...` as at 762-785.

2. Better-Auth-pool bypass for OAuth tables (lines 140-165; `sessions` shape):

```sql
CREATE POLICY sessions_owner_modify ON identity.sessions
  FOR UPDATE TO app_role, worker_role
  USING (user_id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid
         OR current_setting('app.better_auth', true) = 'on')
  WITH CHECK (... same ...);
CREATE POLICY sessions_owner_delete ON identity.sessions
  FOR DELETE TO app_role, worker_role
  USING (user_id = (...)::uuid OR current_setting('app.better_auth', true) = 'on');
```

`app.better_auth=on` is set at connection startup by `betterAuthPool()` (`packages/platform/src/db/pool.ts:58-64`, `options: "-c app.better_auth=on"`). Better Auth issues authorize/token/register calls with no `current_user_id` GUC, so owner-only policies silently match 0 rows. Simplest safe shape for oauth tables: either no RLS (like `identity.verifications`, line 48 comment "NO RLS, token-keyed") plus table GRANT to `app_role`, or `FOR ALL ... USING (current_setting('app.better_auth', true) = 'on' OR user_id = current_user GUC)`. Grant `SELECT, INSERT, UPDATE, DELETE ... TO app_role` and `SELECT` to worker_role as at lines 39-40. Connected-apps list (`/oauth2/get-consents`) goes through Better Auth, so it inherits the same pool.

Test gate: `bun test packages/identity packages/tenancy` stays 99/0, plus a DCR -> token round trip.

---

### `packages/platform/src/mcp/schema.ts` (write log, import previews)

**Analog:** `packages/platform/src/audit/schema.ts` (full file, lines 1-43) and `idempotency/schema.ts`

```typescript
import { sql } from "drizzle-orm";
import { pgPolicy, uuid, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";
import { appRole, workerRole } from "../db/roles";

export const auditHistory = sharedKernel.table("audit_history", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    ...
    beforeJsonb: jsonb("before_jsonb"),
    afterJsonb: jsonb("after_jsonb"),
  },
  (t) => [
    pgPolicy("audit_history_tenant_isolation", {
      as: "permissive", for: "all", to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
```

Note `audit_history` is not reusable for D-08 (no client id, no UPDATE grant), confirmed. Add `mcp_import_previews` with `expiresAt timestamptz` like `idempotencyKeys` (and optionally the worker `for: "delete" using expires_at < now()` cleanup policy, `idempotency/schema.ts:41-50`). The audit table treats sensitive content as DEK-encrypted; the write log `before/after` contain notes and amounts. Decide encrypt-or-omit `note`.

Export from `packages/platform/src/index.ts` next to `export * from "./audit/schema";` (line 8) and `./idempotency` (line 22).

---

### `packages/platform/src/mcp/repo.ts`

**Analog:** `packages/platform/src/idempotency/repo.ts`. Raw SQL via `sql` tagged template on a passed-in `tx`, so it composes with `withTenantTx`.

```typescript
import { sql } from "drizzle-orm";
type Tx = any;

export async function lookupIdempotency(
  tx: Tx,
  scopeHash: string,
): Promise<IdempotencyRow | null> {
  const r = await tx.execute(sql`
    SELECT scope_hash AS "scopeHash", ... FROM shared_kernel.idempotency_keys
     WHERE scope_hash = ${scopeHash} AND expires_at > now() FOR UPDATE`);
  return (r.rows[0] as IdempotencyRow) ?? null;
}
```

Per CLAUDE.md "Drizzle types/queries live ONLY in adapters/persistence", keep the write-log SQL in platform, and have `apps/api/src/mcp/*` call it through `withTenantTx`. Daily-cap query: `SELECT COALESCE(SUM(entry_count),0) FROM shared_kernel.mcp_write_log WHERE client_id=${c} AND user_id=${u} AND created_at > now() - interval '24 hours'`. Use `sql.join` for IN lists (memory: drizzle sql array expands inline).

`withTenantTx` signature (`packages/platform/src/db/tx.ts:25-50`): returns `Result<T, Error>` (memory: silently no-ops without Postgres, so always check `r.isErr()`). Tenant tx takes tenantId + userId and sets `app.tenant_ids` and `app.current_user_id` via `tenantContextSql`.

---

### `apps/api/src/mcp/handler.ts` and `app.ts` mounting

**Analog (mount style):** `apps/api/src/routes/auth.ts` (whole file, pass-through of `c.req.raw`) and `app.ts:60-93`.

```typescript
// routes/auth.ts
export function authRoutes(deps: BootedDeps) {
  const r = new Hono();
  r.all("/*", async (c) => (deps.identity.auth as any).handler(c.req.raw));
  return r;
}
```

Required ordering in `createApp` (`apps/api/src/app.ts`):

```
60  app.use(tracingMiddleware());           // FIRST, /mcp must sit behind it
63  app.use(errorMiddleware);
66  app.use(reserveReadCacheMiddleware(...));
69  app.get("/health", ...)
84  app.use(demoGuard(deps));               // before /auth
87  app.route("/auth", authRoutes(deps));
90  app.use(authMiddleware(deps));          // cookie session
91  app.use(tenantGuard);
92  app.use(createIdempotencyMiddleware());
```

Insert `app.route("/.well-known", wellKnownRoutes(deps))` and `app.all("/mcp", mcpHandler(deps))` immediately after line 87 (`/auth`) and BEFORE line 90, so bearer auth is independent of cookies and `/mcp` never hits `authMiddleware`/`tenantGuard`. The internal dispatch (below) then calls `app.fetch(...)` so those inner requests DO flow through the normal stack from line 90 onward.

Response shape for denials: use `HTTPException` as in `rate-limit.ts:69-71` (`throw new HTTPException(429, { message })`), though for `/mcp` the 401 needs a `WWW-Authenticate: Bearer resource_metadata="..."` header, so return a raw `Response`.

Context typing: `hono-types.ts` augments `ContextVariableMap` with `session`, `tenantIds`, `locale`. The internal-request branch needs `session: { user: { id, email, locale } }`, so fetch `locale`/`email` via `identity.userRepo.findById` (as `boot.ts:279-282` does for display currency) or relax the type.

---

### Internal route dispatch (`dispatch.ts`) and `authMiddleware` branch

**Analog:** `apps/api/src/middleware/auth.ts` (entire file, 12 lines):

```typescript
export const authMiddleware =
  (deps: BootedDeps): MiddlewareHandler =>
  async (c, next) => {
    const session = await (deps.identity.auth as any).api.getSession({
      headers: c.req.raw.headers,
    });
    c.set("session", session ?? null);
    await next();
  };
```

Add one branch before `getSession`: `const w = internalRequests.get(c.req.raw); if (w) { c.set("session", {...}); return next(); }` where `internalRequests` is a module-level `WeakMap<Request, {...}>` exported from `mcp/dispatch.ts`. Tenant guard still runs and verifies membership from `x-budget-id` (`tenant-guard.ts:45-90`: header lowercased OR `X-Budget-ID`, intersected with `tenancy.budget_members`, archived budgets excluded). Do NOT bypass it (D-03, "agent = user's role"). Pin with a unit test that `c.req.raw` identity survives `app.fetch(req)`.

Route expectations discovered for the dispatch map (money = integer minor units, snake_case bodies):

- `POST /budgets/:budgetId/transactions` body `{ date: YYYY-MM-DD, category_id: uuid, amount_original_cents: int (|x| <= 1e13), currency_original?: 3-char, note?: string|null }` (`transactions.ts:50-57`); PATCH adds `kind?: "SPENDING"|"INCOME"` (`:59-70`).
- `PUT /wallets/:id/balance` validated by `setBalanceSchema` and calls `deps.budgeting.setWalletBalance` then `recomputeIncomeUnderPlannedRunner` (`wallets.ts:268-300`). Note it is mounted on the root `/wallets` (X-Budget-ID header scoped), not under `/budgets/:id`. Response is `r.value`; research said "confirm whether it returns old->new" so read the use case `packages/budgeting/src/application/set-wallet-balance.ts`, else GET before.
- Side effects live in the route: `syncReserveTopup` (`transactions.ts:171-185`, best-effort try/catch), `recomputeIncomeUnderPlannedRunner`. This is why dispatch-through-routes is the right call; do not call use cases from tools directly.
- Mutating routes use `app.post("/", zValidator("json", schema), handler)` and map `r.isErr()` to 422 with `{ error }` (`transactions.ts:200+`). The MCP layer should translate non-2xx to MCP `isError` results.

Idempotency: header-driven. `middleware.ts:63-80`. Per-row key = `${callKey}:${index}`. Same key + different body returns 422 `idempotency_key_reused_with_different_body`; replay returns cached status/body. Only runs when `tenantIds` is non-empty, so the internal request must carry `x-budget-id`.

---

### `apps/api/src/mcp/limits.ts`

**Analog:** `apps/api/src/middleware/rate-limit.ts:21-41`

```typescript
export function checkAndRecord(
  key: string,
  windowSec: number,
  max: number,
): boolean {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}
export function clearRateLimits(): void {
  store.clear();
} // tests
```

Keys `mcp:${clientId}:${userId}:r` (60/60) and `:w` (20/60). Tests call `clearRateLimits()` in `beforeEach`. Daily cap comes from the write-log SUM above.

---

### Settings page: Connected apps

**Analog:** `apps/web/src/components/settings/user-settings-shell.tsx` (accordion item pattern, lines 54-90) and `sessions-list.tsx` (list + confirm `AlertDialog` + sonner toast, lines 1-60).

Accordion item (copy; add a `connected-apps` item between Security and Danger Zone):

```tsx
<AccordionItem value="security">
  <AccordionTrigger className="px-6">{tSec("security")}</AccordionTrigger>
  <AccordionContent className={CONTENT}>
    <SecuritySection email={initialProfile.email} />
  </AccordionContent>
</AccordionItem>
```

Translation namespaces: `settings.user.sections.*` for the trigger, own namespace for the body (`settings.sessions` is the model).

Client calls use `authClient` from `@/lib/auth-client` (`createAuthClient` with no baseURL; `/auth/*` is rewritten to the API). For endpoints the client plugin does not expose, use `fetch("/auth/oauth2/get-consents")` / `POST /auth/oauth2/delete-consent` with credentials (same-origin). If `oauthProviderClient` from `@better-auth/oauth-provider/client` is added to `createAuthClient({ plugins })`, import it there. Disconnect must also revoke tokens (research Pattern 6) and use the `AlertDialog` confirm used by "sign out others" (`data-testid="confirm-action"`).

Page container (`settings/[[...tab]]/page.tsx`): server component reads session fresh via `getServerSession({ disableCookieCache: true })` and passes props to the shell. No page change is needed if the list is client-fetched.

Rules from memory: never say "draft" in copy; colour via inline style, not tailwind var (memory twMerge); surfaces use `--surface-*` tokens (memory hardcoded hex).

---

### Consent page `apps/web/src/app/[locale]/oauth/consent/page.tsx`

**Analog:** `apps/web/src/app/[locale]/sign-in/page.tsx` (server page, `getTranslations`, `searchParams: Promise<Record<string,string|string[]|undefined>>`, Card components).

```tsx
interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth" });
```

`client_id`, `scope`, etc. arrive as query params. Place the page where the `(app)` layout's onboarding guard does not bounce first-time users (it sits OUTSIDE `(app)`, like `sign-in`). Login hand-off gap: `sign-in-form.tsx:88-92` always ends with `window.location.href = \`/${targetLocale}\``, with no return-URL handling. The OAuth `loginPage`redirect needs the form to honour a`next`/continue param (or Better Auth's signed `oauth_query`handling) so the user lands back on`/auth/oauth2/authorize?...`. That is a required modification to `apps/web/src/components/auth/sign-in-form.tsx`, not yet in research's file list. Hard navigation (not `router.push`) must be kept, per the comment there.

---

### Next rewrites and `proxy.ts` matcher

**Analog:** `apps/web/next.config.mjs:60-72` and `apps/web/proxy.ts`.

```javascript
async rewrites() {
  const apiBase = process.env["API_INTERNAL_URL"] ?? "http://api:4000";
  return [
    { source: "/auth/:path*", destination: `${apiBase}/auth/:path*` },
    { source: "/api/:path*",  destination: `${apiBase}/:path*` },
  ];
},
```

Add `{ source: "/mcp", destination: \`${apiBase}/mcp\` }` and `{ source: "/.well-known/:path*", destination: \`${apiBase}/.well-known/:path*\` }`. Note `/auth/*`is already rewritten, which is why the issuer is`<web>/auth`.

`proxy.ts` (entire file):

```typescript
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

`/auth/*` currently passes this matcher too (rewrites are applied after middleware in Next, and it works today). `/mcp` matches and gets next-intl locale-redirect treatment. `/.well-known/oauth-...` contains dots, but `.*\\..*` requires a dot in any segment, so `/.well-known/oauth-protected-resource` is ALREADY excluded (it starts with a dot), while `/mcp` is NOT. Research said both are not excluded; verify empirically with a request test. Safe edit: `"/((?!api|auth|mcp|\\.well-known|_next|.*\\..*).*)"`.

Security headers (`next.config.mjs` `headers()`): `X-Frame-Options: DENY` and `frame-ancestors 'none'` apply to the consent page. That is fine (top-level navigation), but do not embed consent in an iframe. `form-action 'self'` in CSP: a consent form POST that 302s to a third-party `redirect_uri` is blocked by Chrome's form-action redirect enforcement, so POST consent via `fetch` and navigate with `window.location` instead of a native `<form>`.

Service worker: `sw.ts` caches navigations on the web origin. Add `/oauth/consent` to the network-only list if it matters, and see memory "SW cache-first vs server-rendered routes" (`SERVER_DATA_ROUTE`).

---

### Account-deletion cascade

**Analog:** `packages/identity/src/adapters/persistence/better-auth.ts:100-262` (`TENANT_TABLES` at ~line 100-118, user-level step at 232-250)

```typescript
const TENANT_TABLES = [
  "budgeting.budget_mode_history",
  ..."shared_kernel.idempotency_keys",
  "shared_kernel.notification_prefs",
  "shared_kernel.push_subscriptions",
] as const;
```

Applied per purged budget: `DELETE FROM ${tbl} WHERE tenant_id = '${bid}'`. Add `"shared_kernel.mcp_write_log"` and `"shared_kernel.mcp_import_previews"`. Note `audit_history` is deliberately NOT in this list (no DELETE grant; relies on DEK crypto-shred, see the doc comment above the list). If `mcp_write_log` follows the audit model (no DELETE grant), say so in a comment and encrypt sensitive fields; otherwise grant `DELETE` to `app_role` in `post-migration.sql`, because the cascade runs as `app_role` in `withUserContext`.

User-level step (add alongside the `DELETE FROM tenancy.budget_members WHERE user_id = ...` statements, `:232-236`): delete the user's OAuth consents, access tokens, refresh tokens (and clients they registered if the schema links `userId`) through `tx.execute(sql\`DELETE FROM identity.oauth_consent WHERE user_id = ${uid}::uuid\`)`. Because the OAuth tables are in the identity schema they run under the same transaction. They need a policy that admits this (user GUC match, or no RLS).

`apps/web/e2e/fixtures/cleanup-fixture-data.ts:31-54` has its own `TENANT_TABLES` list used to sweep E2E fixtures; add the two new tables or leftover rows accumulate.

**Test analog:** `packages/identity/test/account-deletion-cascade.test.ts`. Uses `startTestcontainer()`, `createAuth({ emailSender: new StdoutEmailSender(), keyStore })`, `signUp(...)` per user, a `seedBudget(...)` helper that inserts under `withUserContext`. Extend `seedBudget` to insert one `mcp_write_log` row and one OAuth consent, then assert zero residual after `purgeUserData`. Env setup block (lines 22-30) to copy: `BUDGET_KEK`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`.

---

### Integration tests for new routes

**Analog:** `apps/api/test/routes/push.test.ts` (lines 1-60). Real Postgres, no mocks (CLAUDE.md rule 3):

```typescript
const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();
```

Fixture inserts `identity.users`, `tenancy.budgets` (`kind 'PRIVATE'`, `owner_user_id`, `member_count 1`), `tenancy.budget_members` (`role 'owner'`) in one tx.

**Route-coverage gate** (`apps/api/test/routes/route-coverage-audit.test.ts:34-44`): scans only `apps/api/src/routes/*.ts`. Keeping the adapter in `apps/api/src/mcp/` avoids the gate; if any file is added under `routes/`, add `<name>.test.ts` or an entry in `CONSOLIDATED`. CLAUDE.md rule 8 still applies: every HTTP route needs an integration test, so add `apps/api/test/routes/mcp.test.ts` + `mcp-well-known.test.ts`.

MCP tests must `trace.disable()` before installing their own provider (CLAUDE.md). Tool allowlist test (Pitfall 9) and readOnlyHint test (Pitfall 10) iterate the registry.

---

### Gherkin E2E for Connected apps

**Analogs:** `apps/web/e2e/features/settings-security.feature`, `apps/web/e2e/steps/settings-security.steps.ts`, `apps/web/e2e/page-objects/SettingsPo.ts`.

Feature file shape (tag on first line, Background, scenarios):

```gherkin
@settings-security
Feature: User settings — Security section (password + sessions)
  Background:
    Given I am signed in as a fresh user
  Scenario: ...
    When I open the Security section
```

Steps file shape:

```typescript
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
const { Given, When, Then } = createBdd(test);

When("I open the Security section", async ({ page }) => {
  await page.goto("/en/settings");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  await page.getByRole("button", { name: "Security" }).click();
  await page
    .getByTestId("change-password-button")
    .waitFor({ state: "visible", timeout: 10000 });
});
```

Minting server-side state from a step: `Given("I have a second active session", async ({ freshUser, baseURL }) => { await fetch(\`${base}/auth/sign-in/email\`, { method: "POST", headers: {"content-type":"application/json", Origin: base}, body: ... }) })`. For Connected apps, create a connected app by driving DCR + authorize + consent from the step (or seed a consent row via the DB helper), then assert it appears and Disconnect removes it.

Page-object shape (`SettingsPo`): class with `constructor(private page: Page)`, idempotent open method (`getAttribute("aria-expanded") !== "true"` then click), locator getters. Create `ConnectedAppsPo.ts` the same way rather than raw `.spec.ts` (memory: E2E Gherkin + Page Objects; fresh user per scenario, never raw `.spec.ts`).

Rules from memory: bounded waits (`.catch()` never runs after `dispatchEvent`, memory "Bounded waits in E2E"); test base URL is `https://budget-dev.madonzy.com`; run `bddgen` after editing features; real MCP-protocol E2E (SDK client in `bun:test`) lives in `apps/api/test`, and add a public-host metadata GET for `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server/auth`, and unauthenticated `/mcp` -> 401 with `WWW-Authenticate`.

---

## Shared Patterns

### Tenant/user context for every DB touch

**Source:** `packages/platform/src/db/tx.ts` (`withTenantTx`, `withTenantTxRead`, `withInfraTx`, `withUserContext`, `withBootstrapUserContext`)
**Apply to:** write log, import previews, daily-cap query. Never open `pool.connect()` directly (CI gate `grep:no-pool-connect`, `tx.ts` doc comment). Results are `Result<T, Error>`; check `isErr()`.

### Money at the MCP boundary

**Source:** `transactions.ts:33-48` (`boundedCents`, `MAX_TXN_CENTS`) and CLAUDE.md "Money value object converts at adapter boundary". Tools accept `{ amount: "12.34", currency }`, convert with `big.js` to integer cents, and send `amount_original_cents`. `local/no-float-money` ESLint rule must pass. Server-side conversion is authoritative (T-02-02: converted amount never from client body).

### Error mapping

**Source:** `apps/api/src/middleware/error.ts` and per-route `r.isErr()` -> `c.json({ error }, 422)`. Dispatch layer must turn non-2xx internal responses into MCP `isError: true` content including the route `error` string. Unknown errors become `HTTPException(500, "internal error")`.

### Public vs authenticated mounting

**Source:** `app.ts:96-110`. Public routes must be registered BEFORE `requireAuth` fences (`/budgets/join` is the precedent). `/mcp` and `/.well-known` go before `authMiddleware` entirely.

### Hand-authored SQL must be journalled

**Source:** `drizzle/meta/_journal.json` tail (idx 103-105 shape) and memory "Drizzle journal registration".

### Docker / new workspace package wiring

**Source:** `apps/api/Dockerfile:11-23, 60-61`, `apps/web/Dockerfile:12-19`.
The plan keeps MCP in `apps/api/src/mcp/` and `packages/platform/src/mcp/`, so no new workspace package and no new `COPY` line. `apps/api/Dockerfile` copies `apps/api/package.json` + all of `packages` so new deps in `apps/api/package.json` and `packages/identity/package.json` are enough. `apps/web/Dockerfile:15-17` copies `packages/` and `apps/api/src/` (for `AppType`), so the web image build also type-checks the new `src/mcp/**` and needs the new dependencies installable: run `make build-api` AND `make build-web`. Regenerate `bun.lock` (never hand-edit, `--frozen-lockfile` in images), add `@better-auth/oauth-provider` to root `package.json` `overrides` (next to better-auth, `package.json:44-56`), and keep the exact pin `1.7.15`. If the plan nonetheless creates a new `packages/mcp`, memory "New workspace package wiring" applies: dependency + every `exports` subpath + COPY of its `package.json` in EVERY Dockerfile (api, web, worker, migrator).

### Tracing

**Source:** `tracingMiddleware` registered first at `app.ts:60`. Gotcha: after `make build-api`, always rebuild with `TRACING_ENV` targets (CLAUDE.md). No new instrumentation needed; internal `app.fetch` subrequests nest under the `/mcp` span.

## No Analog Found

| File                                                                                                    | Role       | Data Flow        | Reason                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ---------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/mcp/server.ts` + `tools/*` + `prompts.ts` (MCP protocol registration, `createMcpHandler`) | service    | request-response | No JSON-RPC/MCP code exists. Use RESEARCH.md Pattern 2 and tool-map. The Hono pass-through (`routes/auth.ts`) covers only mounting.                                                                                                    |
| `apps/api/src/mcp/handler.ts` bearer JWT verification                                                   | middleware | request-response | No bearer-token auth exists (only cookie sessions via `authMiddleware`). Use `oauthProviderResourceClient.verifyAccessTokenRequest` per RESEARCH.md; confirm call shape in the first task. Use loopback `jwksUrl`, not the public URL. |
| Compensating-atomicity import (`import_commit` with auto-undo)                                          | service    | batch            | Every use case opens its own `withTenantTx`; no multi-use-case batch pattern exists.                                                                                                                                                   |
| `search_transactions` full-history read                                                                 | service    | CRUD (read)      | `search-transactions.ts` has no route and is on the legacy `corrects_id` model; the live read is `GET /budgets/:id/transactions?month=` (`transactions.ts:80-90`, month-only). Build a new cursor query.                               |

## Metadata

**Analog search scope:** `apps/api/src` (app, middleware, routes), `apps/api/test/routes`, `apps/web` (proxy, next.config, settings components, sign-in, e2e features/steps/page-objects/fixtures), `apps/migrator/post-migration.sql`, `drizzle/`, `packages/identity`, `packages/platform` (audit, idempotency, db), `packages/tenancy` factory, Dockerfiles
**Files read:** ~35
**Pattern extraction date:** 2026-11-05
**Not read:** remainder of RESEARCH.md (lines 519-668: open questions, validation architecture). Planner should read those directly.
