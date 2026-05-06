---
phase: 01-foundations
plan: "01"
plan_id: "01.01"
subsystem: shared-kernel
tags: [money, clock, result, ids, env, ports, tdd, domain-primitives]
dependency_graph:
  requires: ["01.00"]
  provides: ["shared-kernel"]
  affects: ["all bounded contexts"]
tech_stack:
  added:
    - "big.js ^7 — decimal arithmetic for Money (fiat + crypto)"
    - "neverthrow ^8 — Result<T,E> type for domain operations"
    - "uuidv7 ^1 — time-sortable UUID v7 for branded IDs"
    - "zod ^3 — env schema validation"
  patterns:
    - "Value object (Money) with private constructor + static factory"
    - "Branded types: string & { __brand } for compile-time ID safety"
    - "Port/adapter: interface + InMemory fake per integration point"
    - "TDD: RED (test file) → GREEN (impl) → tsc strict clean"
key_files:
  created:
    - packages/shared-kernel/src/money.ts
    - packages/shared-kernel/src/clock.ts
    - packages/shared-kernel/src/result.ts
    - packages/shared-kernel/src/ids.ts
    - packages/shared-kernel/src/env.ts
    - packages/shared-kernel/src/ports/fx-provider.ts
    - packages/shared-kernel/src/ports/email-sender.ts
    - packages/shared-kernel/src/ports/crypto-keys.ts
    - packages/shared-kernel/src/ports/outbox.ts
    - packages/shared-kernel/src/ports/llm-provider.ts
    - packages/shared-kernel/src/ports/stt-provider.ts
    - packages/shared-kernel/src/ports/index.ts
    - packages/shared-kernel/test/money.test.ts
    - packages/shared-kernel/test/money-crypto.test.ts
    - packages/shared-kernel/test/clock.test.ts
    - packages/shared-kernel/test/result.test.ts
    - packages/shared-kernel/test/ids.test.ts
    - packages/shared-kernel/test/env.test.ts
    - packages/shared-kernel/test/ports.test.ts
  modified:
    - packages/shared-kernel/src/index.ts
    - packages/shared-kernel/package.json
    - bun.lock
decisions:
  - "Used big.js directly (not Dinero v2) for Money internals — Dinero v2's architecture adds unnecessary complexity for a pure value object; big.js gives direct precision control per CLAUDE.md recommendation"
  - "Zod v3 (not v4) — CLAUDE.md specifies Zod v3 as stack standard; plan's ^4.4.3 was overridden by CLAUDE.md directive"
  - "toDb() uses toFixed(scale) to normalize precision at DB boundary — fiat 4dp, crypto 18dp — preserves exact values"
  - "toString() also uses toFixed(scale) for consistent display with full precision"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-05-06"
  tasks_completed: 3
  files_created: 19
  files_modified: 3
  tests_written: 47
---

# Phase 1 Plan 01: Shared Kernel Summary

**One-liner:** Money value object (big.js, fiat 4dp + crypto 18dp), Clock port, neverthrow Result, UUID v7 branded IDs, Zod env schema, and 6 port skeletons with InMemory fakes — all TDD with 47 tests, tsc strict + dep-cruiser clean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Money + Clock + Result + branded IDs (TDD) | 6daab66 | money.ts, clock.ts, result.ts, ids.ts, index.ts + 5 test files |
| 2 | Env Zod schema (boot fail-fast) | 95e5ad1 | env.ts + env.test.ts |
| 3 | Port skeletons + InMemory fakes | f3cf570 | 6 port files + index.ts + ports.test.ts |

## What Was Built

### Money (`src/money.ts`)
- `Money.of(amount, currency)` — private constructor, static factory, never uses `Number()`
- `add()` throws `"Cannot add Money values in different currencies"` on mismatch
- `toDb()` returns `{ amount_str, currency }` — string preserves exact decimal precision
- Fiat scale: 4 decimal places (NUMERIC(19,4) DB shape), `Big.RM = 2` (banker's rounding)
- Crypto scale: 18 decimal places (NUMERIC(38,18) DB shape)
- `isCrypto()` checks `BTC | ETH`

### Clock (`src/clock.ts`)
- `Clock` interface: `now(): Date`
- `SystemClock` — wraps `new Date()`
- `FakeClock` — injectable, supports `advance(ms)` and `set(d)`, returns copies (mutation-safe)

### Result (`src/result.ts`)
- Re-exports `ok`, `err`, `okAsync`, `errAsync`, `fromPromise`, `fromThrowable`, `Result`, `ResultAsync` from neverthrow

### Branded IDs (`src/ids.ts`)
- `TenantId = string & { __brand: 'TenantId' }` — compile-time enforcement
- `UserId = string & { __brand: 'UserId' }`
- `newTenantId()` / `newUserId()` — UUID v7 (time-sortable)

### Env (`src/env.ts`)
- Zod v3 schema: `DATABASE_URL_*`, `BUDGET_KEK` (44-char base64 regex), `BETTER_AUTH_*`, `APP_URL`
- `LOG_LEVEL` defaults `'info'`, `REGION` defaults `'eu-central-1'`
- `parseEnv(source)` for testing; `loadEnv()` lazy singleton for app boot

### Ports + InMemory Fakes (`src/ports/`)
- `FxProvider` + `InMemoryFxProvider` (configurable fixed rates, MONY-08)
- `EmailSender` + `StdoutEmailSender` (stdout + `sent[]` buffer for assertions)
- `CryptoKeyStore` + `InMemoryCryptoKeyStore` (identity round-trip, no real crypto — Plan 4 ships libsodium)
- `OutboxWriter` + `InMemoryOutbox` (captures events for assertion)
- `LLMProvider` + `InMemoryLLMProvider` (canned fixture)
- `STTProvider` + `InMemorySTTProvider` (canned transcript)

## Verification Results

```
bun test packages/shared-kernel    →  47 pass, 0 fail
tsc --noEmit -p tsconfig.json      →  exit 0 (strict clean)
depcruise packages/shared-kernel   →  no violations (17 modules)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Money.toString() precision fix**
- **Found during:** Task 1 — `Money.of('1.50', 'USD').toString()` returned `"1.5 USD"` instead of `"1.50 USD"`
- **Fix:** `toString()` now uses `toFixed(scale)` consistent with `toDb()` — fiat 4dp, crypto 18dp
- **Files modified:** packages/shared-kernel/src/money.ts
- **Commit:** 6daab66

**2. [Rule 2 - CLAUDE.md override] Zod v3 instead of plan's Zod v4**
- **Found during:** Task 2 — plan specified `zod@^4.4.3` but CLAUDE.md explicitly mandates Zod v3 as ecosystem standard
- **Fix:** Used `zod@^3.23.8` — no API differences for the schema patterns used here
- **Files modified:** packages/shared-kernel/package.json

**3. [Rule 3 - Blocker] Husky pre-commit hook missing `_/husky.sh`**
- **Found during:** First commit attempt — `.husky/_/husky.sh` did not exist in worktree
- **Fix:** Ran `bunx husky` in repo root to initialize husky internals; subsequent commits succeed
- **Impact:** Zero code changes, build unaffected

**4. [Rule 1 - Bug] neverthrow `err<T,E>` type parameter order**
- **Found during:** tsc strict check — test used `err<string, number>('fail')` but neverthrow signature is `err<T=ok, E=err>`
- **Fix:** Changed to `err<number, string>('fail')` — T=ok type, E=error type
- **Files modified:** packages/shared-kernel/test/result.test.ts
- **Commit:** 6daab66

**5. [Rule 1 - Bug] Branded type `.toBe()` comparison**
- **Found during:** tsc strict check — `expect(id).toBe('test-tenant')` fails because `TenantId` is not assignable to `string` in strict TS
- **Fix:** Cast to `string` at assertion boundary: `expect(id as string).toBe('test-tenant')` — this is correct: the assertion tests runtime value, not compile-time type; the brand check is proven by tsc itself
- **Files modified:** packages/shared-kernel/test/ids.test.ts
- **Commit:** 6daab66

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-01-01-01 | Mitigated — big.js only, no Number(), toDb() returns string |
| T-01-01-02 | Mitigated — branded types enforced by tsc; ids.test.ts proves compile-time rejection |
| T-01-01-03 | Mitigated — Zod schema fails-fast on boot if BUDGET_KEK missing or malformed |
| T-01-01-04 | Accepted — lint rule banning `process.env` outside `env.ts` is Phase 6 |
| T-01-01-05 | Mitigated — `Money.add()` throws on currency mismatch, no silent coercion |

## Known Stubs

None — all implementations are complete for their scope. `InMemoryCryptoKeyStore` is intentionally an identity stub (no real crypto); the Plan explicitly documents that Plan 4 ships the libsodium adapter.

## Self-Check: PASSED

Files exist:
- packages/shared-kernel/src/money.ts — FOUND
- packages/shared-kernel/src/clock.ts — FOUND
- packages/shared-kernel/src/result.ts — FOUND
- packages/shared-kernel/src/ids.ts — FOUND
- packages/shared-kernel/src/env.ts — FOUND
- packages/shared-kernel/src/ports/fx-provider.ts — FOUND
- packages/shared-kernel/src/ports/email-sender.ts — FOUND
- packages/shared-kernel/src/ports/crypto-keys.ts — FOUND
- packages/shared-kernel/src/ports/outbox.ts — FOUND
- packages/shared-kernel/src/ports/llm-provider.ts — FOUND
- packages/shared-kernel/src/ports/stt-provider.ts — FOUND

Commits exist:
- 6daab66 — FOUND (Task 1)
- 95e5ad1 — FOUND (Task 2)
- f3cf570 — FOUND (Task 3)
