---
phase: 01-foundations
plan: 04
plan_id: 01.04
type: execute
wave: 1
depends_on: ['01.00', '01.01', '01.02']
files_modified:
  - packages/platform/src/crypto/libsodium-key-store.ts
  - packages/platform/src/crypto/user-keys-schema.ts
  - packages/platform/src/crypto/dek-context.ts
  - packages/platform/src/index.ts
  - packages/platform/test/crypto-key-store.test.ts
  - packages/platform/test/email-hash.test.ts
  - packages/platform/test/sodium-ready.test.ts
  - apps/migrator/post-migration.sql
autonomous: true
requirements: [ENGR-13, MONY-09]
must_haves:
  truths:
    - "libsodium adapter implements CryptoKeyStore port (D-16) using crypto_secretbox_easy"
    - "Per-user 32-byte DEK generated on user creation; persisted as cipher_dek + nonce in shared_kernel.user_keys"
    - "DEK wrapping uses KEK from env BUDGET_KEK (32-byte base64); never persisted plaintext"
    - "encryptForUser / decryptForUser round-trip plaintext correctly"
    - "emailHash deterministic via crypto_generichash keyed by KEK (lookup-by-email survives boot)"
    - "AsyncLocalStorage-based DEK request cache: decode once per request, drop at response end"
    - "await sodium.ready completes at boot before any encrypt/decrypt call (Pitfall 9)"
    - "PC-12: user_keys is USER-SCOPED, not tenant-scoped — RLS uses app.current_user_id GUC (NOT app.tenant_ids)"
    - "PC-07: writes to user_keys MUST use withUserContext(userId, fn) primitive (Plan 02 Task 2). NEVER withTenantTx — the table has no tenant column"
    - "Phase 1 ships the table + wrap/unwrap primitives; Phase 6 ships the destroy flow (right-to-delete via DEK overwrite)"
  artifacts:
    - path: packages/platform/src/crypto/libsodium-key-store.ts
      provides: "LibsodiumKeyStore implementing CryptoKeyStore port (D-16)"
      contains: "crypto_secretbox_easy"
    - path: packages/platform/src/crypto/user-keys-schema.ts
      provides: "shared_kernel.user_keys table — USER-SCOPED RLS (PC-12) — keyed by app.current_user_id"
      contains: "user_keys"
    - path: packages/platform/src/crypto/dek-context.ts
      provides: "AsyncLocalStorage request-scoped DEK cache"
      contains: "AsyncLocalStorage"
  key_links:
    - from: "packages/platform/src/crypto/libsodium-key-store.ts"
      to: "libsodium-wrappers crypto_secretbox_easy"
      via: "import"
      pattern: "from 'libsodium-wrappers'"
    - from: "packages/platform/src/crypto/libsodium-key-store.ts"
      to: "BUDGET_KEK env"
      via: "loadEnv()"
      pattern: "BUDGET_KEK"
    - from: "packages/platform/src/crypto/dek-context.ts"
      to: "AsyncLocalStorage (node:async_hooks)"
      via: "import"
      pattern: "node:async_hooks"
    - from: "packages/platform/src/crypto/user-keys-schema.ts"
      to: "withUserContext primitive (Plan 02 Task 2)"
      via: "RLS predicate user_id = current_setting('app.current_user_id')"
      pattern: "app.current_user_id"
---

<objective>
Ship the libsodium-backed CryptoKeyStore: per-user DEK generation/wrapping, AEAD encrypt/decrypt for PII columns, deterministic email hashing, and the user_keys table.

Purpose: D-16 mandates app-side libsodium + KEK-from-env + per-user DEK + ciphertext PII columns. Phase 1 ships the wrap/unwrap correctness primitive — Phase 6 ships the destroy flow (right-to-delete via DEK overwrite). The InMemoryCryptoKeyStore from Plan 1 is the test fake; this plan provides the real adapter that the API + worker boot wire to.

PC-12 + PC-07: user_keys is a USER-SCOPED table — its RLS policy keys off `app.current_user_id` GUC (NOT `app.tenant_ids`). All writes/reads MUST use `withUserContext(userId, fn)` from Plan 02 Task 2 — never `withTenantTx`. user_keys carries no tenant_id column and has no tenant-isolation policy.

Output: A `packages/platform/src/crypto/*` module set with libsodium-backed implementation, plus the `shared_kernel.user_keys` table.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-foundations/01-CONTEXT.md
@.planning/phases/01-foundations/01-RESEARCH.md
@CLAUDE.md
@packages/shared-kernel/src/ports/crypto-keys.ts
@packages/shared-kernel/src/env.ts
@packages/platform/src/db/schemas.ts
@packages/platform/src/db/tx.ts

<interfaces>
<!-- Concrete adapter implementing the port from Plan 1 -->
import type { CryptoKeyStore, UserId } from '@budget/shared-kernel';

export class LibsodiumKeyStore implements CryptoKeyStore {
  // Internally uses libsodium-wrappers + KEK from loadEnv().BUDGET_KEK.
  // Methods: generateUserDek, unwrapUserDek, encryptForUser, decryptForUser, emailHash
}

export const dekContext: {
  // AsyncLocalStorage-based per-request DEK cache
  run<T>(dek: Uint8Array, fn: () => Promise<T>): Promise<T>;
  get(): Uint8Array | undefined;
};

// PC-12: shared_kernel.user_keys is USER-SCOPED — RLS keys off app.current_user_id.
// Phase 1 schema declares ONE policy (user_keys_owner_only) with predicate
// `user_id = current_setting('app.current_user_id')::uuid`. Tenant context is irrelevant
// here — user_keys is user-owned data that crosses tenants (every workspace the user belongs to
// uses the SAME DEK).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: shared_kernel.user_keys schema + post-migration grants (PC-12 user-scoped RLS)</name>
  <files>
    packages/platform/src/crypto/user-keys-schema.ts,
    packages/platform/src/index.ts,
    apps/migrator/post-migration.sql
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md D-16 (key store details, user_keys table layout)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 7: libsodium key store" + §"Common Pitfalls" Pitfall 11 (email_hash + crypto-shredding)
    - packages/platform/src/db/schemas.ts (sharedKernel pgSchema)
    - packages/platform/src/db/tx.ts (PC-07 withUserContext primitive — REQUIRED for user_keys writes)
    - apps/migrator/post-migration.sql (pattern for FORCE RLS + GRANT statements)
  </read_first>
  <behavior>
    - shared_kernel.user_keys columns: user_id (uuid PK), cipher_dek (bytea NOT NULL), nonce (bytea NOT NULL), created_at, destroyed_at (nullable, Phase 6 sets when DEK destroyed)
    - PC-12: NO tenant_id column. user_keys is USER-SCOPED.
    - RLS policy `user_keys_owner_only`: user_id = current_setting('app.current_user_id')::uuid — user can read/update their own DEK row
    - app_role: SELECT, INSERT, UPDATE on user_keys (UPDATE so Phase 6 can overwrite cipher_dek to NULL bytea)
    - worker_role: SELECT only (workers may need to encrypt for users via DEK fetch — but never modify)
    - FORCE RLS in post-migration.sql
    - PC-07: writes/reads to user_keys MUST be wrapped in withUserContext(userId, fn) — withTenantTx is the wrong primitive (no tenant column to scope by)
  </behavior>
  <action>
    1. Implement `packages/platform/src/crypto/user-keys-schema.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import { pgPolicy, uuid, customType, timestamp } from 'drizzle-orm/pg-core';
       import { sharedKernel } from '../db/schemas';
       import { appRole, workerRole } from '../db/roles';

       const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
         dataType() { return 'bytea'; },
         toDriver(v) { return Buffer.from(v); },
         fromDriver(v) { return new Uint8Array(v); },
       });

       /**
        * D-16: per-user DEK encrypted with KEK (from env BUDGET_KEK).
        *
        * PC-12: user_keys is USER-SCOPED, NOT tenant-scoped. The table has no tenant_id
        * column. RLS keys off `app.current_user_id` GUC (NOT `app.tenant_ids`).
        * One DEK per user crosses every workspace they belong to.
        *
        * PC-07: All writes/reads to this table MUST use the `withUserContext(userId, fn)`
        * primitive from packages/platform/src/db/tx.ts — never `withTenantTx` (wrong primitive
        * for user-scoped tables).
        *
        * Phase 1 ships the table + wrap/unwrap. Phase 6 adds destroyed_at flow + cipher_dek
        * overwrite for right-to-delete.
        * Pitfall 11: at destruction, also overwrite email_hash on identity.users to a tombstone.
        */
       export const userKeys = sharedKernel.table('user_keys', {
         userId: uuid('user_id').primaryKey(),
         cipherDek: bytea('cipher_dek').notNull(),
         nonce: bytea('nonce').notNull(),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
         destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
       }, (t) => [
         pgPolicy('user_keys_owner_only', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
           withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
         }),
       ]);
       ```
    2. Update `packages/platform/src/index.ts` to add: `export * from './crypto/user-keys-schema'; export * from './crypto/libsodium-key-store'; export * from './crypto/dek-context';`
    3. APPEND to `apps/migrator/post-migration.sql`:
       ```sql
       -- Plan 04: user_keys (D-16 — crypto-shredding key store)
       -- PC-12: user-scoped (RLS keyed by app.current_user_id), NOT tenant-scoped
       GRANT SELECT, INSERT, UPDATE ON shared_kernel.user_keys TO app_role;
       GRANT SELECT ON shared_kernel.user_keys TO worker_role;
       ALTER TABLE shared_kernel.user_keys FORCE ROW LEVEL SECURITY;
       ```
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/platform/tsconfig.json && grep -F 'user_keys_owner_only' packages/platform/src/crypto/user-keys-schema.ts && grep -F 'shared_kernel.user_keys FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql</automated>
  </verify>
  <acceptance_criteria>
    - user-keys-schema.ts declares userKeys table: `grep -F "sharedKernel.table('user_keys'" packages/platform/src/crypto/user-keys-schema.ts` exits 0
    - schema declares all D-16 columns: `for col in user_id cipher_dek nonce created_at destroyed_at; do grep -F "$col" packages/platform/src/crypto/user-keys-schema.ts; done` exits 0
    - PC-12: schema does NOT declare a tenant_id column: `! grep -F "tenantId: uuid('tenant_id')" packages/platform/src/crypto/user-keys-schema.ts` exits 0
    - schema declares pgPolicy keyed by app.current_user_id (PC-12, PC-07): `grep -F "app.current_user_id" packages/platform/src/crypto/user-keys-schema.ts` exits 0
    - PC-12 documentation comment present: `grep -F 'PC-12' packages/platform/src/crypto/user-keys-schema.ts && grep -F 'USER-SCOPED' packages/platform/src/crypto/user-keys-schema.ts` exits 0
    - PC-07 documentation comment present: `grep -F 'withUserContext' packages/platform/src/crypto/user-keys-schema.ts` exits 0
    - post-migration.sql grants on user_keys: `grep -F 'GRANT SELECT, INSERT, UPDATE ON shared_kernel.user_keys TO app_role' apps/migrator/post-migration.sql && grep -F 'GRANT SELECT ON shared_kernel.user_keys TO worker_role' apps/migrator/post-migration.sql` exits 0
    - post-migration.sql FORCE RLS on user_keys: `grep -F 'shared_kernel.user_keys FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql` exits 0
    - `bunx tsc --noEmit -p packages/platform/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>user_keys table declared with USER-SCOPED owner-only RLS policy (PC-12 — keyed by app.current_user_id, not app.tenant_ids), GRANTs and FORCE RLS in post-migration.sql. PC-07: writes/reads MUST use withUserContext from Plan 02 Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: LibsodiumKeyStore adapter + sodium.ready boot smoke (D-16, Pitfall 9)</name>
  <files>
    packages/platform/package.json,
    packages/platform/src/crypto/libsodium-key-store.ts,
    packages/platform/test/crypto-key-store.test.ts,
    packages/platform/test/email-hash.test.ts,
    packages/platform/test/sodium-ready.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 7: libsodium key store" (lines 809-871) — full reference
    - .planning/phases/01-foundations/01-CONTEXT.md D-16
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 9 (await sodium.ready), Pitfall 11 (email_hash + DEK destroy)
    - packages/shared-kernel/src/ports/crypto-keys.ts (interface to implement)
    - packages/shared-kernel/src/env.ts (BUDGET_KEK source)
  </read_first>
  <behavior>
    Test 1 (sodium-ready): calling `await libsodiumReady()` resolves; subsequent crypto calls succeed without re-init.
    Test 2 (round-trip): `generateUserDek` → `unwrapUserDek` returns the same 32-byte DEK; `encryptForUser` then `decryptForUser` returns original plaintext.
    Test 3 (key separation): wrapping with KEK_A and unwrapping with KEK_B (mismatched) throws.
    Test 4 (emailHash determinism): `emailHash('a@b.com')` returns the same bytes on every call given the same KEK; case-insensitive (`A@B.com` produces same hash).
    Test 5 (emailHash KEK rotation): different KEK produces different hash for same email (intentional — Pitfall 11 rotation invalidates lookups).
  </behavior>
  <action>
    1. Add to `packages/platform/package.json` dependencies: `"libsodium-wrappers": "^0.7.6"` and devDependencies: `"@types/libsodium-wrappers": "^0.7.0"`. Run `bun install`.
    2. Implement `packages/platform/src/crypto/libsodium-key-store.ts` (use the EXACT pattern from RESEARCH §Pattern 7 — but expose as a class implementing CryptoKeyStore):
       ```ts
       import sodium from 'libsodium-wrappers';
       import type { CryptoKeyStore, UserId } from '@budget/shared-kernel';
       import { loadEnv } from '@budget/shared-kernel';

       /** Pitfall 9: await sodium.ready once at boot before any crypto call. */
       let _ready = false;
       export async function libsodiumReady(): Promise<void> {
         if (!_ready) { await sodium.ready; _ready = true; }
       }

       export class LibsodiumKeyStore implements CryptoKeyStore {
         constructor(private kekOverride?: string) {}

         private kekBytes(): Uint8Array {
           const kek = this.kekOverride ?? loadEnv().BUDGET_KEK;
           return sodium.from_base64(kek, sodium.base64_variants.ORIGINAL);
         }

         async generateUserDek(_userId: UserId): Promise<{ cipherDek: Uint8Array; nonce: Uint8Array }> {
           await libsodiumReady();
           const dek = sodium.crypto_secretbox_keygen();
           const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
           const cipherDek = sodium.crypto_secretbox_easy(dek, nonce, this.kekBytes());
           return { cipherDek, nonce };
         }

         async unwrapUserDek(record: { cipherDek: Uint8Array; nonce: Uint8Array }): Promise<Uint8Array> {
           await libsodiumReady();
           const dek = sodium.crypto_secretbox_open_easy(record.cipherDek, record.nonce, this.kekBytes());
           if (!dek) throw new Error('DEK unwrap failed — KEK rotated, record corrupted, or DEK destroyed (right-to-delete)');
           return dek;
         }

         async encryptForUser(dek: Uint8Array, plaintext: string): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
           await libsodiumReady();
           const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
           const ciphertext = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, dek);
           return { ciphertext, nonce };
         }

         async decryptForUser(dek: Uint8Array, record: { ciphertext: Uint8Array; nonce: Uint8Array }): Promise<string> {
           await libsodiumReady();
           const plaintext = sodium.crypto_secretbox_open_easy(record.ciphertext, record.nonce, dek);
           if (!plaintext) throw new Error('Decrypt failed — DEK destroyed (crypto-shred) or record tampered');
           return sodium.to_string(plaintext);
         }

         /** Deterministic lookup hash. Pitfall 11: KEK as BLAKE2b key. */
         async emailHash(email: string): Promise<Uint8Array> {
           await libsodiumReady();
           return sodium.crypto_generichash(32, sodium.from_string(email.toLowerCase()), this.kekBytes());
         }
       }
       ```
    3. WRITE TEST `packages/platform/test/sodium-ready.test.ts`:
       ```ts
       import { test, expect } from 'bun:test';
       import { libsodiumReady } from '../src/crypto/libsodium-key-store';

       test('libsodium ready resolves and is idempotent', async () => {
         await libsodiumReady();
         await libsodiumReady();
         const sodium = (await import('libsodium-wrappers')).default;
         await sodium.ready;
         const k = sodium.crypto_secretbox_keygen();
         expect(k.length).toBe(32);
       });
       ```
    4. WRITE TEST `packages/platform/test/crypto-key-store.test.ts`:
       ```ts
       import { test, expect } from 'bun:test';
       import { LibsodiumKeyStore } from '../src/crypto/libsodium-key-store';
       import { UserId } from '@budget/shared-kernel';

       const KEK_A = 'A'.repeat(43) + '=';
       const KEK_B = 'B'.repeat(43) + '=';

       test('LibsodiumKeyStore round-trips DEK', async () => {
         const ks = new LibsodiumKeyStore(KEK_A);
         const wrapped = await ks.generateUserDek(UserId('u1'));
         const dek = await ks.unwrapUserDek(wrapped);
         expect(dek.length).toBe(32);
       });

       test('LibsodiumKeyStore encryptForUser / decryptForUser round-trip', async () => {
         const ks = new LibsodiumKeyStore(KEK_A);
         const wrapped = await ks.generateUserDek(UserId('u1'));
         const dek = await ks.unwrapUserDek(wrapped);
         const enc = await ks.encryptForUser(dek, 'hello@user.com');
         const dec = await ks.decryptForUser(dek, enc);
         expect(dec).toBe('hello@user.com');
       });

       test('LibsodiumKeyStore unwrap fails with wrong KEK', async () => {
         const ksA = new LibsodiumKeyStore(KEK_A);
         const ksB = new LibsodiumKeyStore(KEK_B);
         const wrapped = await ksA.generateUserDek(UserId('u1'));
         await expect(ksB.unwrapUserDek(wrapped)).rejects.toThrow();
       });
       ```
    5. WRITE TEST `packages/platform/test/email-hash.test.ts`:
       ```ts
       import { test, expect } from 'bun:test';
       import { LibsodiumKeyStore } from '../src/crypto/libsodium-key-store';

       const KEK_A = 'A'.repeat(43) + '=';
       const KEK_B = 'B'.repeat(43) + '=';

       test('emailHash deterministic same KEK', async () => {
         const ks = new LibsodiumKeyStore(KEK_A);
         const h1 = await ks.emailHash('a@b.com');
         const h2 = await ks.emailHash('a@b.com');
         expect(Buffer.from(h1).toString('hex')).toBe(Buffer.from(h2).toString('hex'));
       });

       test('emailHash case-insensitive', async () => {
         const ks = new LibsodiumKeyStore(KEK_A);
         const h1 = await ks.emailHash('A@B.com');
         const h2 = await ks.emailHash('a@b.com');
         expect(Buffer.from(h1).toString('hex')).toBe(Buffer.from(h2).toString('hex'));
       });

       test('emailHash differs across KEK rotation (Pitfall 11)', async () => {
         const ksA = new LibsodiumKeyStore(KEK_A);
         const ksB = new LibsodiumKeyStore(KEK_B);
         const hA = await ksA.emailHash('a@b.com');
         const hB = await ksB.emailHash('a@b.com');
         expect(Buffer.from(hA).toString('hex')).not.toBe(Buffer.from(hB).toString('hex'));
       });
       ```
    6. Run tests — confirm GREEN.
  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test packages/platform/test/sodium-ready.test.ts packages/platform/test/crypto-key-store.test.ts packages/platform/test/email-hash.test.ts && bunx tsc --noEmit -p packages/platform/tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - libsodium-key-store.ts implements CryptoKeyStore: `grep -F 'implements CryptoKeyStore' packages/platform/src/crypto/libsodium-key-store.ts` exits 0
    - uses crypto_secretbox_easy: `grep -F 'crypto_secretbox_easy' packages/platform/src/crypto/libsodium-key-store.ts` exits 0
    - uses crypto_generichash for emailHash: `grep -F 'crypto_generichash' packages/platform/src/crypto/libsodium-key-store.ts` exits 0
    - reads KEK from env: `grep -F 'BUDGET_KEK' packages/platform/src/crypto/libsodium-key-store.ts` exits 0
    - exports libsodiumReady: `grep -F 'export async function libsodiumReady' packages/platform/src/crypto/libsodium-key-store.ts` exits 0
    - All 3 tests pass: `bun test packages/platform/test/sodium-ready.test.ts packages/platform/test/crypto-key-store.test.ts packages/platform/test/email-hash.test.ts` exits 0
    - `bunx tsc --noEmit -p packages/platform/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>LibsodiumKeyStore real adapter shipped + tested. Pitfall 9 (sodium.ready) covered. Pitfall 11 (KEK rotation invalidates email lookup) verified by test.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: AsyncLocalStorage DEK request cache</name>
  <files>
    packages/platform/src/crypto/dek-context.ts,
    packages/platform/test/crypto-key-store.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md D-16 ("Decryption key cache is in-process (request-scoped)")
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 7" trailing note ("DEK cache: request-scoped (decode once, drop at response end). Implement via AsyncLocalStorage in Hono middleware.")
    - Bun documentation: AsyncLocalStorage available via `node:async_hooks` (Bun 1.3 supports it)
  </read_first>
  <behavior>
    - dekContext.run(dek, fn) sets the dek in storage for the duration of fn (and any awaited descendants)
    - dekContext.get() returns the current dek inside the run scope
    - Outside any run scope, dekContext.get() returns undefined
    - Two parallel run() calls do NOT see each other's dek (AsyncLocalStorage isolation)
  </behavior>
  <action>
    1. Implement `packages/platform/src/crypto/dek-context.ts`:
       ```ts
       import { AsyncLocalStorage } from 'node:async_hooks';

       const als = new AsyncLocalStorage<Uint8Array>();

       export const dekContext = {
         run<T>(dek: Uint8Array, fn: () => Promise<T>): Promise<T> {
           return new Promise((resolve, reject) => {
             als.run(dek, () => { fn().then(resolve, reject); });
           });
         },
         get(): Uint8Array | undefined {
           return als.getStore();
         },
       };
       ```
    2. APPEND test cases to `packages/platform/test/crypto-key-store.test.ts`:
       ```ts
       import { dekContext } from '../src/crypto/dek-context';
       test('dekContext.get returns undefined outside run scope', () => {
         expect(dekContext.get()).toBeUndefined();
       });
       test('dekContext.run scopes the DEK', async () => {
         const dek = new Uint8Array([1, 2, 3]);
         const inside = await dekContext.run(dek, async () => dekContext.get());
         expect(inside).toEqual(dek);
       });
       test('dekContext two concurrent runs are isolated', async () => {
         const a = new Uint8Array([1]);
         const b = new Uint8Array([2]);
         const [ra, rb] = await Promise.all([
           dekContext.run(a, async () => dekContext.get()),
           dekContext.run(b, async () => dekContext.get()),
         ]);
         expect(ra).toEqual(a);
         expect(rb).toEqual(b);
       });
       ```
    3. Run tests — confirm GREEN.
  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test packages/platform/test/crypto-key-store.test.ts && bunx tsc --noEmit -p packages/platform/tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - dek-context.ts uses node:async_hooks: `grep -F "from 'node:async_hooks'" packages/platform/src/crypto/dek-context.ts` exits 0
    - dekContext exports run + get: `grep -E '(run|get)' packages/platform/src/crypto/dek-context.ts | wc -l` returns at least 2
    - Concurrent isolation test passes (rolled into crypto-key-store.test.ts): `bun test packages/platform/test/crypto-key-store.test.ts` exits 0
  </acceptance_criteria>
  <done>AsyncLocalStorage DEK cache shipped. apps/api middleware (Plan 7) wires this in via tenant-guard / auth middleware.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Process boot → KEK | KEK from env (secret manager); never in DB, never logged |
| Request → DEK | Request middleware decrypts user's DEK, places in AsyncLocalStorage; encrypted at rest |
| App memory → response | DEK exists in process memory only for request lifetime; no persistence to disk |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04-01 | Information Disclosure | Plaintext PII in DB (email, display_name) — Phase-1 high-severity invariant per CLAUDE.md compliance constraints | mitigate | LibsodiumKeyStore implements crypto_secretbox_easy AEAD; PII columns persisted as bytea ciphertext in identity context (Plan 5); right-to-delete via DEK destruction ships Phase 6 |
| T-01-04-02 | Information Disclosure | KEK exposure (logged, dumped, committed) | mitigate | KEK only via env BUDGET_KEK (zod-validated 44-char base64); never appears in pino logs (logging guards in Phase 6 — Phase 1 documents in code comments); .env is gitignored; .env.example has empty BUDGET_KEK placeholder |
| T-01-04-03 | Tampering | Wrong KEK in deployment causes silent decrypt failures returning garbage | mitigate | crypto_secretbox_open_easy returns null on auth tag failure; LibsodiumKeyStore throws explicit error "DEK unwrap failed — KEK rotated, record corrupted, or DEK destroyed". Never returns garbage |
| T-01-04-04 | Spoofing | Reidentification via email_hash after DEK destroyed (Pitfall 11) | mitigate | Phase 6 destroy flow overwrites both cipher_dek AND email_hash to tombstone bytes; Phase 1 documents this requirement in the user_keys schema comment so Phase 6 implementer cannot miss it |
| T-01-04-05 | Information Disclosure | DEK leakage between requests via shared in-process cache | mitigate | AsyncLocalStorage scopes DEK to request promise chain only; concurrent isolation verified by test; no module-global DEK |
| T-01-04-06 | Tampering | libsodium not initialized when first crypto call runs (Pitfall 9) | mitigate | libsodiumReady() guard at start of every public method; idempotent; sodium-ready.test.ts asserts it works; apps/api boot calls libsodiumReady() before binding HTTP listener |
| T-01-04-07 | Elevation of Privilege | One user reading another user's DEK row | mitigate | shared_kernel.user_keys pgPolicy keyed by current_setting('app.current_user_id') = row user_id (PC-12, USER-SCOPED); FORCE RLS in post-migration.sql; tenant-leak CI gate (Plan 10) extends to this table by asserting policy effect; PC-07: writes wrapped in withUserContext (NOT withTenantTx — wrong primitive for user-scoped data) |
</threat_model>

<verification>
```bash
cd /home/claude/budget
bunx tsc --noEmit -p packages/platform/tsconfig.json
bun test packages/platform/test/sodium-ready.test.ts
bun test packages/platform/test/crypto-key-store.test.ts
bun test packages/platform/test/email-hash.test.ts
bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/platform
grep -F 'shared_kernel.user_keys FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql
grep -F 'GRANT SELECT, INSERT, UPDATE ON shared_kernel.user_keys TO app_role' apps/migrator/post-migration.sql
grep -F 'PC-12' packages/platform/src/crypto/user-keys-schema.ts
grep -F 'withUserContext' packages/platform/src/crypto/user-keys-schema.ts
```
All exit 0.
</verification>

<success_criteria>
- LibsodiumKeyStore implements CryptoKeyStore using crypto_secretbox_easy + crypto_generichash
- libsodiumReady() guard at every public method (Pitfall 9)
- Per-user DEK round-trips through KEK wrapping correctly
- Wrong-KEK unwrap throws explicit error
- emailHash deterministic, case-insensitive, KEK-keyed (rotation invalidates lookups per Pitfall 11)
- AsyncLocalStorage DEK request cache; concurrent runs isolated
- shared_kernel.user_keys table is USER-SCOPED (PC-12) — RLS keys off app.current_user_id, NOT app.tenant_ids; no tenant_id column
- PC-07: schema documentation requires withUserContext for all writes/reads (never withTenantTx)
- post-migration.sql appended with user_keys grants + FORCE RLS
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-04-SUMMARY.md`
</output>
