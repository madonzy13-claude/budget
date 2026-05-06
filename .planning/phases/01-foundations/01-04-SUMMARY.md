# Plan 01.04 — crypto-shredding-store — COMPLETE

**Commit:** 12da9a5 (feat(01-04): LibsodiumKeyStore + DEK context + crypto tests)
**Preceded by:** 090b88b (feat(01-04): add shared_kernel.user_keys schema with USER-SCOPED RLS)

## Artifacts Delivered

| Artifact                                              | Status                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/platform/src/crypto/user-keys-schema.ts`    | ✅ user_keys table, USER-SCOPED RLS (PC-12), owner-only policy keyed by `app.current_user_id` |
| `packages/platform/src/crypto/libsodium-key-store.ts` | ✅ LibsodiumKeyStore implements CryptoKeyStore port (D-16)                                    |
| `packages/platform/src/crypto/dek-context.ts`         | ✅ AsyncLocalStorage request-scoped DEK cache                                                 |
| `packages/platform/src/index.ts`                      | ✅ exports all 3 crypto modules                                                               |
| `apps/migrator/post-migration.sql`                    | ✅ GRANT + FORCE RLS for user_keys                                                            |
| `packages/platform/test/crypto-key-store.test.ts`     | ✅ 6 tests (round-trip, wrong-KEK throws, dekContext scope)                                   |
| `packages/platform/test/email-hash.test.ts`           | ✅ 3 tests (determinism, case-insensitive, KEK rotation)                                      |
| `packages/platform/test/sodium-ready.test.ts`         | ✅ 1 test (idempotent ready)                                                                  |

## Test Results

10 pass / 0 fail across 3 files

## Key Decisions

- **ESM workaround**: libsodium-wrappers 0.7.x ESM bundle references `./libsodium.mjs` absent at runtime in Bun. Used `createRequire(import.meta.url)` (CJS path) with `as typeof import('libsodium-wrappers')` cast — works in tests and runtime.
- **TS types fix**: `@types/libsodium-wrappers` has no `.default` export — cast to `typeof import('libsodium-wrappers')` directly (not `.default`).
- PC-12 enforced: `user_keys` has no `tenant_id` column; RLS policy `user_keys_owner_only` keys off `app.current_user_id`.
- PC-07 documented in schema comment: writes must use `withUserContext`, never `withTenantTx`.

## Forward References

- Phase 6: DEK destroy flow (right-to-delete) — overwrite `cipher_dek` to NULL + tombstone `email_hash`
- Plan 07 (tenant-context-middleware): wire `libsodiumReady()` at API boot before HTTP listener
- Plan 07: Hono auth middleware wraps requests with `dekContext.run(dek, fn)`
