---
phase: 01-foundations
plan: 01
plan_id: 01.01
type: execute
wave: 1
depends_on: ["01.00"]
files_modified:
  - packages/shared-kernel/src/index.ts
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
  - packages/shared-kernel/package.json
autonomous: true
requirements:
  [MONY-01, MONY-07, MONY-08, ENGR-01, ENGR-05, ENGR-11, ENGR-12, ENGR-13]
must_haves:
  truths:
    - "Money(USD).add precision-stable: Money.of('1.99', 'USD').add(Money.of('0.01', 'USD')) equals Money.of('2.00', 'USD')"
    - "Money rejects mixing currencies — throws on Money(USD) + Money(EUR)"
    - "Money round-trips fiat through NUMERIC(19,4) DB shape (D-19)"
    - "Money round-trips crypto through NUMERIC(38,18) DB shape with big.js precision"
    - "Clock port provides SystemClock (real now) + FakeClock (injected time) for ENGR-11 determinism"
    - "Result<T,E> via neverthrow: ok().isOk() === true, err().isErr() === true (D-21, ENGR-12)"
    - "TenantId / UserId branded types reject bare string at compile time (D-22)"
    - "TenantId / UserId generated as UUID v7 (time-sortable per D-22)"
    - "Env zod schema fails-fast on missing BUDGET_KEK / DATABASE_URL_*"
    - "Port skeletons + InMemory fakes for FxProvider, EmailSender (StdoutEmailSender), CryptoKeyStore, OutboxWriter, LLMProvider, STTProvider (ENGR-13)"
  artifacts:
    - path: packages/shared-kernel/src/money.ts
      provides: "Money value object — Dinero v2 + big.js, fiat NUMERIC(19,4) + crypto NUMERIC(38,18)"
      contains: "export class Money"
    - path: packages/shared-kernel/src/clock.ts
      provides: "Clock port + SystemClock + FakeClock (D-20)"
      contains: "export interface Clock"
    - path: packages/shared-kernel/src/result.ts
      provides: "Result<T,E> via neverthrow re-export + helpers (D-21)"
      contains: "neverthrow"
    - path: packages/shared-kernel/src/ids.ts
      provides: "Branded TenantId, UserId, generators (D-22)"
      contains: "TenantId"
    - path: packages/shared-kernel/src/env.ts
      provides: "Zod schema + parsed env, fail-fast at boot"
      contains: "BUDGET_KEK"
    - path: packages/shared-kernel/src/ports/fx-provider.ts
      provides: "FxProvider port + InMemoryFxProvider fake (MONY-08)"
      contains: "export interface FxProvider"
    - path: packages/shared-kernel/src/ports/email-sender.ts
      provides: "EmailSender port + StdoutEmailSender dev adapter"
      contains: "StdoutEmailSender"
    - path: packages/shared-kernel/src/ports/crypto-keys.ts
      provides: "CryptoKeyStore port (encryptForUser/decryptForUser)"
      contains: "CryptoKeyStore"
    - path: packages/shared-kernel/src/ports/outbox.ts
      provides: "OutboxWriter port"
      contains: "OutboxWriter"
    - path: packages/shared-kernel/src/ports/llm-provider.ts
      provides: "LLMProvider port (Phase 5 wires Claude/Groq adapters)"
      contains: "LLMProvider"
    - path: packages/shared-kernel/src/ports/stt-provider.ts
      provides: "STTProvider port (Phase 5 wires Browser/Groq adapters)"
      contains: "STTProvider"
  key_links:
    - from: "packages/shared-kernel/src/money.ts"
      to: "dinero.js + big.js"
      via: "import"
      pattern: "from 'dinero.js'"
    - from: "packages/shared-kernel/src/result.ts"
      to: "neverthrow"
      via: "re-export"
      pattern: "from 'neverthrow'"
    - from: "packages/shared-kernel/src/index.ts"
      to: "all submodules"
      via: "export *"
      pattern: "export"
---

<objective>
Ship the shared kernel: Money value object, Clock port, Result type, branded IDs, env validator, and port skeletons (FX/email/crypto/STT/LLM/outbox) with in-memory fakes.

Purpose: ENGR-05 mandates a tiny, business-logic-free shared kernel. Every later context (Identity, Tenancy, Budgeting, etc.) imports from here. D-19 (Money), D-20 (Clock), D-21 (Result), D-22 (branded IDs), and ENGR-13 (port skeletons) all land in this plan. The ESLint `no-float-money` rule (Plan 0) will start firing meaningfully against Money use sites once code arrives in later plans.

Output: A `packages/shared-kernel` that compiles strict, has 100% domain coverage, and is the only cross-package importable contracts surface alongside `packages/<context>/contracts`.
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
@packages/shared-kernel/tsconfig.json

<interfaces>
<!-- Money — exported shape consumed by every adapter boundary -->
export type FiatCurrency = 'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | 'CHF' | 'NOK' | 'SEK';
export type CryptoCurrency = 'BTC' | 'ETH';
export type Currency = FiatCurrency | CryptoCurrency;

export class Money {
static of(amount: string | number, currency: Currency): Money;
add(other: Money): Money;
sub(other: Money): Money;
mul(factor: string | number): Money;
equals(other: Money): boolean;
isCrypto(): boolean;
toDb(): { amount_str: string; currency: Currency }; // string preserves precision
static fromDb(amount_str: string, currency: Currency): Money;
toString(): string;
readonly amount: Big; // exact decimal (big.js)
readonly currency: Currency;
}

<!-- Clock port -->

export interface Clock { now(): Date; }
export class SystemClock implements Clock { now(): Date; }
export class FakeClock implements Clock {
constructor(initial: Date);
now(): Date;
advance(ms: number): void;
set(d: Date): void;
}

<!-- Result -->

export { ok, err, Result, ResultAsync, okAsync, errAsync } from 'neverthrow';

<!-- Branded IDs -->

export type TenantId = string & { readonly **brand: 'TenantId' };
export type UserId = string & { readonly **brand: 'UserId' };
export const TenantId = (s: string): TenantId => s as TenantId;
export const UserId = (s: string): UserId => s as UserId;
export function newTenantId(): TenantId; // UUID v7
export function newUserId(): UserId; // UUID v7

<!-- Env -->

export const env: {
DATABASE_URL_APP: string;
DATABASE_URL_WORKER: string;
DATABASE_URL_MIGRATOR: string;
BUDGET_KEK: string; // 32-byte base64
BETTER_AUTH_SECRET: string;
BETTER_AUTH_URL: string;
APP_URL: string;
REGION: string;
LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
};

<!-- Ports — every external integration sits behind one of these -->

export interface FxProvider {
rateAsOf(from: Currency, to: Currency, date: Date): Promise<{ rate: string; provider: string; isStale: boolean }>;
}
export interface EmailSender {
send(args: { to: string; template: string; vars: Record<string, unknown> }): Promise<void>;
}
export interface CryptoKeyStore {
generateUserDek(userId: UserId): Promise<{ cipherDek: Uint8Array; nonce: Uint8Array }>;
unwrapUserDek(record: { cipherDek: Uint8Array; nonce: Uint8Array }): Promise<Uint8Array>;
encryptForUser(dek: Uint8Array, plaintext: string): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }>;
decryptForUser(dek: Uint8Array, record: { ciphertext: Uint8Array; nonce: Uint8Array }): Promise<string>;
emailHash(email: string): Promise<Uint8Array>;
}
export interface OutboxWriter {
write(tx: unknown, evt: { tenantId: TenantId; aggregateType: string; aggregateId: string; eventType: string; payload: unknown }): Promise<void>;
}
export interface LLMProvider {
generateObject<T>(args: { schema: unknown; prompt: string; userId: UserId }): Promise<T>;
}
export interface STTProvider {
transcribe(args: { audio: Uint8Array; language: 'en' | 'pl' | 'uk' }): Promise<{ text: string }>;
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Money + Clock + Result + branded IDs (TDD: tests first)</name>
  <files>
    packages/shared-kernel/src/money.ts,
    packages/shared-kernel/src/clock.ts,
    packages/shared-kernel/src/result.ts,
    packages/shared-kernel/src/ids.ts,
    packages/shared-kernel/src/index.ts,
    packages/shared-kernel/package.json,
    packages/shared-kernel/test/money.test.ts,
    packages/shared-kernel/test/money-crypto.test.ts,
    packages/shared-kernel/test/clock.test.ts,
    packages/shared-kernel/test/result.test.ts,
    packages/shared-kernel/test/ids.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 8: Money value object" (lines 875-922) — full reference impl
    - .planning/phases/01-foundations/01-CONTEXT.md D-19, D-20, D-21, D-22
    - .planning/phases/01-foundations/01-VALIDATION.md rows 5a-5f (Money/Clock/Result/IDs verifications)
    - CLAUDE.md §"Money: Dinero.js v2" + §"Date/time: Temporal API" + §"Supporting Libraries"
    - packages/shared-kernel/package.json (current state — to add deps)
  </read_first>
  <behavior>
    Money tests (write FIRST, must fail before code):
      - Test 1: `Money.of('1.99', 'USD').add(Money.of('0.01', 'USD')).equals(Money.of('2.00', 'USD'))` is true
      - Test 2: `Money.of('1', 'USD').add(Money.of('1', 'EUR'))` THROWS with message containing "different currencies"
      - Test 3: `Money.of('100.0001', 'USD').toDb().amount_str === '100.0001'` (NUMERIC(19,4) — 4 decimals)
      - Test 4: `Money.fromDb('100.0001', 'USD').amount.toString() === '100.0001'`
      - Test 5 (crypto): `Money.of('0.123456789012345678', 'BTC').toDb().amount_str === '0.123456789012345678'` (18 decimals preserved)
      - Test 6 (crypto round-trip): `Money.fromDb('0.123456789012345678', 'BTC').equals(Money.of('0.123456789012345678', 'BTC'))` is true
      - Test 7: `Money.of('1.50', 'USD').isCrypto() === false`; `Money.of('1', 'BTC').isCrypto() === true`
    Clock tests:
      - SystemClock.now() returns a Date close to Date.now()
      - FakeClock(d).now() === d
      - FakeClock advance(1000) increments now by 1s
      - FakeClock set(d2) replaces now with d2
    Result tests:
      - `ok(1).isOk() === true`, `ok(1).value === 1`
      - `err('e').isErr() === true`, `err('e').error === 'e'`
      - Chainable: `ok(1).map(x => x + 1).isOk() === true`
    IDs tests:
      - newTenantId() returns 36-char UUID matching v7 pattern (ts-prefix sortable)
      - Two consecutive newTenantId() calls produce monotonically non-decreasing values lexicographically (UUID v7 timestamp prefix)
      - `function takesTenantId(_t: TenantId): void {}; takesTenantId('raw' as string)` MUST fail to compile (covered by tsc test)
  </behavior>
  <action>
    1. Add dependencies to `packages/shared-kernel/package.json`:
       ```json
       "dependencies": {
         "big.js": "^7.0.1",
         "neverthrow": "^8.2.0",
         "uuidv7": "^1.0.2",
         "zod": "^4.4.3"
       },
       "devDependencies": {
         "@types/big.js": "^6.2.0"
       }
       ```
       Run `bun install`.
    2. WRITE TESTS FIRST. Create all 5 test files (`money.test.ts`, `money-crypto.test.ts`, `clock.test.ts`, `result.test.ts`, `ids.test.ts`) with the behavior table above using `bun:test`:
       ```ts
       import { test, expect } from 'bun:test';
       import { Money } from '../src/money';
       test('Money USD add precise', () => {
         const a = Money.of('1.99', 'USD');
         const b = Money.of('0.01', 'USD');
         expect(a.add(b).equals(Money.of('2.00', 'USD'))).toBe(true);
       });
       test('Money different currencies throws', () => {
         expect(() => Money.of('1', 'USD').add(Money.of('1', 'EUR'))).toThrow(/different currencies/i);
       });
       // ... etc per behavior list
       ```
       Run `bun test packages/shared-kernel` — confirm all FAIL (RED phase).
    3. Implement `packages/shared-kernel/src/money.ts` — class with private constructor, `static of`, `add` (throws on currency mismatch with message "Cannot add Money values in different currencies — convert first"), `sub`, `mul`, `equals`, `isCrypto`, `toDb` (returns string for precision), `fromDb`. Use big.js internally; `CRYPTO_CURRENCIES = new Set(['BTC', 'ETH'])`. fiat scale = 4 decimals via `.toFixed(4)`; crypto scale = 18 decimals via `.toFixed(18)`. NEVER use Number(). Use `Big.roundHalfEven` for fiat rounding (half-banker's, finance standard).
    4. Implement `packages/shared-kernel/src/clock.ts`:
       ```ts
       export interface Clock { now(): Date; }
       export class SystemClock implements Clock { now() { return new Date(); } }
       export class FakeClock implements Clock {
         constructor(private current: Date) {}
         now() { return new Date(this.current); }
         advance(ms: number) { this.current = new Date(this.current.getTime() + ms); }
         set(d: Date) { this.current = new Date(d); }
       }
       ```
    5. Implement `packages/shared-kernel/src/result.ts`:
       ```ts
       export { ok, err, okAsync, errAsync, Result, ResultAsync, fromPromise, fromThrowable } from 'neverthrow';
       ```
    6. Implement `packages/shared-kernel/src/ids.ts`:
       ```ts
       import { uuidv7 } from 'uuidv7';
       export type TenantId = string & { readonly __brand: 'TenantId' };
       export type UserId = string & { readonly __brand: 'UserId' };
       export const TenantId = Object.assign((s: string): TenantId => s as TenantId, {});
       export const UserId = Object.assign((s: string): UserId => s as UserId, {});
       export const newTenantId = (): TenantId => uuidv7() as TenantId;
       export const newUserId = (): UserId => uuidv7() as UserId;
       ```
    7. Implement `packages/shared-kernel/src/index.ts`:
       ```ts
       export * from './money';
       export * from './clock';
       export * from './result';
       export * from './ids';
       export * from './env';
       export * from './ports';
       ```
    8. Run `bun test packages/shared-kernel` — confirm all GREEN.
  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test packages/shared-kernel/test/money.test.ts packages/shared-kernel/test/money-crypto.test.ts packages/shared-kernel/test/clock.test.ts packages/shared-kernel/test/result.test.ts packages/shared-kernel/test/ids.test.ts && bunx tsc --noEmit -p packages/shared-kernel/tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/shared-kernel/src/money.ts` contains `export class Money`: `grep -F 'export class Money' packages/shared-kernel/src/money.ts` exits 0
    - Money uses big.js (not number): `grep -F "from 'big.js'" packages/shared-kernel/src/money.ts` exits 0
    - File `packages/shared-kernel/src/clock.ts` exports SystemClock + FakeClock: `grep -E 'export class (SystemClock|FakeClock)' packages/shared-kernel/src/clock.ts | wc -l` returns 2
    - File `packages/shared-kernel/src/result.ts` re-exports from neverthrow: `grep -F "from 'neverthrow'" packages/shared-kernel/src/result.ts` exits 0
    - File `packages/shared-kernel/src/ids.ts` declares branded TenantId: `grep -F "__brand: 'TenantId'" packages/shared-kernel/src/ids.ts` exits 0
    - File `packages/shared-kernel/src/ids.ts` uses uuidv7: `grep -F "from 'uuidv7'" packages/shared-kernel/src/ids.ts` exits 0
    - All 5 test files exist: `ls packages/shared-kernel/test/{money,money-crypto,clock,result,ids}.test.ts | wc -l` returns 5
    - `bun test packages/shared-kernel/test/money.test.ts` exits 0
    - `bun test packages/shared-kernel/test/money-crypto.test.ts` exits 0
    - `bun test packages/shared-kernel/test/clock.test.ts` exits 0
    - `bun test packages/shared-kernel/test/result.test.ts` exits 0
    - `bun test packages/shared-kernel/test/ids.test.ts` exits 0
    - `bunx tsc --noEmit -p packages/shared-kernel/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>Money/Clock/Result/IDs implemented TDD, all tests green, strict TS compiles. Branded IDs reject bare strings at compile time.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Env zod schema (boot fail-fast)</name>
  <files>
    packages/shared-kernel/src/env.ts,
    packages/shared-kernel/test/env.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md §"Claude's Discretion" (zod env validation, fail-fast)
    - .env.example (created by Plan 0 — list of required keys)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Standard Stack" (zod 4.4.3)
  </read_first>
  <behavior>
    - parseEnv({}) throws ZodError listing all missing required keys
    - parseEnv({ all required keys present }) returns a typed object matching the env interface
    - BUDGET_KEK must be 32-byte base64 (44 chars including padding) — invalid format throws
    - LOG_LEVEL defaults to 'info' if absent
    - REGION defaults to 'eu-central-1' if absent (PLAT-11 single-region documented)
  </behavior>
  <action>
    1. WRITE `packages/shared-kernel/test/env.test.ts` FIRST:
       ```ts
       import { test, expect } from 'bun:test';
       import { parseEnv } from '../src/env';

       const valid = {
         DATABASE_URL_APP: 'postgresql://app_role:pw@db:5432/budget',
         DATABASE_URL_WORKER: 'postgresql://worker_role:pw@db:5432/budget',
         DATABASE_URL_MIGRATOR: 'postgresql://migrator:pw@db:5432/budget',
         BUDGET_KEK: 'A'.repeat(43) + '=',  // 44-char base64
         BETTER_AUTH_SECRET: 'x'.repeat(32),
         BETTER_AUTH_URL: 'http://localhost:3000',
         APP_URL: 'http://localhost:3000',
       };

       test('valid env parses', () => {
         const env = parseEnv(valid);
         expect(env.DATABASE_URL_APP).toBe(valid.DATABASE_URL_APP);
         expect(env.LOG_LEVEL).toBe('info');
         expect(env.REGION).toBe('eu-central-1');
       });
       test('missing required throws', () => {
         expect(() => parseEnv({})).toThrow();
       });
       test('BUDGET_KEK wrong length throws', () => {
         expect(() => parseEnv({ ...valid, BUDGET_KEK: 'short' })).toThrow();
       });
       ```
       Confirm RED.
    2. Implement `packages/shared-kernel/src/env.ts`:
       ```ts
       import { z } from 'zod';

       const schema = z.object({
         DATABASE_URL_APP: z.string().url(),
         DATABASE_URL_WORKER: z.string().url(),
         DATABASE_URL_MIGRATOR: z.string().url(),
         BUDGET_KEK: z.string().regex(/^[A-Za-z0-9+/=]{44}$/, 'BUDGET_KEK must be 32-byte base64 (44 chars)'),
         BETTER_AUTH_SECRET: z.string().min(32),
         BETTER_AUTH_URL: z.string().url(),
         APP_URL: z.string().url(),
         REGION: z.string().default('eu-central-1'),
         LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
       });

       export type Env = z.infer<typeof schema>;
       export function parseEnv(source: Record<string, string | undefined>): Env {
         return schema.parse(source);
       }
       // Lazy-loaded; consumers in apps/* call parseEnv(process.env) at boot
       let cached: Env | undefined;
       export function loadEnv(): Env {
         if (!cached) cached = parseEnv(process.env);
         return cached;
       }
       ```
    3. Run tests — confirm GREEN.

  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test packages/shared-kernel/test/env.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/shared-kernel/src/env.ts` exports parseEnv: `grep -F 'export function parseEnv' packages/shared-kernel/src/env.ts` exits 0
    - Schema enforces BUDGET_KEK length: `grep -E 'BUDGET_KEK.*regex' packages/shared-kernel/src/env.ts` exits 0
    - LOG_LEVEL defaults to info: `grep -F "default('info')" packages/shared-kernel/src/env.ts` exits 0
    - REGION defaults to eu-central-1 (PLAT-11): `grep -F 'eu-central-1' packages/shared-kernel/src/env.ts` exits 0
    - `bun test packages/shared-kernel/test/env.test.ts` exits 0
  </acceptance_criteria>
  <done>Env validation fails fast on missing/invalid keys; tested.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Port skeletons + InMemory fakes (FX, Email, Crypto, Outbox, LLM, STT)</name>
  <files>
    packages/shared-kernel/src/ports/fx-provider.ts,
    packages/shared-kernel/src/ports/email-sender.ts,
    packages/shared-kernel/src/ports/crypto-keys.ts,
    packages/shared-kernel/src/ports/outbox.ts,
    packages/shared-kernel/src/ports/llm-provider.ts,
    packages/shared-kernel/src/ports/stt-provider.ts,
    packages/shared-kernel/src/ports/index.ts,
    packages/shared-kernel/test/ports.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md §"code_context" → §"Integration Points" (list of ports Phase 1 publishes)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Coverage Map" ENGR-13 (FX, email, crypto, STT, LLM, outbox port skeletons)
    - .planning/phases/01-foundations/01-CONTEXT.md D-16 (CryptoKeyStore semantics)
  </read_first>
  <behavior>
    - InMemoryFxProvider returns a stable rate (e.g. 1.0 same-currency, recorded fakes for cross-currency)
    - StdoutEmailSender writes to stdout AND to an injectable buffer (so tests can read sent messages)
    - InMemoryCryptoKeyStore provides fake encryptForUser/decryptForUser that round-trip plaintext (no real crypto)
    - InMemoryOutbox captures writes for assertion
    - InMemoryLLMProvider returns a fixture object
    - InMemorySTTProvider returns a fixture transcript
    - All fakes implement their port — tsc verifies via structural typing
  </behavior>
  <action>
    1. WRITE `packages/shared-kernel/test/ports.test.ts` FIRST:
       ```ts
       import { test, expect } from 'bun:test';
       import {
         InMemoryFxProvider, StdoutEmailSender, InMemoryCryptoKeyStore,
         InMemoryOutbox, InMemoryLLMProvider, InMemorySTTProvider,
       } from '../src/ports';
       import { TenantId, UserId } from '../src/ids';

       test('InMemoryFxProvider returns 1 for same currency', async () => {
         const fx = new InMemoryFxProvider();
         const r = await fx.rateAsOf('USD', 'USD', new Date());
         expect(r.rate).toBe('1');
         expect(r.isStale).toBe(false);
       });
       test('StdoutEmailSender captures sent', async () => {
         const sender = new StdoutEmailSender();
         await sender.send({ to: 'a@b.c', template: 'verify', vars: { url: 'http://x' } });
         expect(sender.sent).toHaveLength(1);
         expect(sender.sent[0].to).toBe('a@b.c');
       });
       test('InMemoryCryptoKeyStore round-trips plaintext', async () => {
         const ks = new InMemoryCryptoKeyStore();
         const dek = await ks.unwrapUserDek(await ks.generateUserDek(UserId('u1')));
         const enc = await ks.encryptForUser(dek, 'hello');
         const dec = await ks.decryptForUser(dek, enc);
         expect(dec).toBe('hello');
       });
       test('InMemoryOutbox records writes', async () => {
         const ob = new InMemoryOutbox();
         await ob.write({}, { tenantId: TenantId('t1'), aggregateType: 'A', aggregateId: 'i1', eventType: 'e', payload: { x: 1 } });
         expect(ob.events).toHaveLength(1);
       });
       test('InMemoryLLMProvider returns fixture', async () => {
         const llm = new InMemoryLLMProvider({ canned: { ok: true } });
         const r = await llm.generateObject({ schema: null, prompt: 'p', userId: UserId('u') });
         expect(r).toEqual({ ok: true });
       });
       test('InMemorySTTProvider returns fixture', async () => {
         const stt = new InMemorySTTProvider({ canned: 'hello world' });
         const r = await stt.transcribe({ audio: new Uint8Array(), language: 'en' });
         expect(r.text).toBe('hello world');
       });
       ```
       Confirm RED.
    2. Create each port file with the EXACT interface from `<interfaces>` plus its in-memory fake. Examples:
       - `fx-provider.ts`:
         ```ts
         import type { Currency } from '../money';
         export interface FxProvider {
           rateAsOf(from: Currency, to: Currency, date: Date): Promise<{ rate: string; provider: string; isStale: boolean }>;
         }
         export class InMemoryFxProvider implements FxProvider {
           constructor(private fixed: Record<string, string> = {}) {}
           async rateAsOf(from: Currency, to: Currency, _date: Date) {
             if (from === to) return { rate: '1', provider: 'in-memory', isStale: false };
             const key = `${from}->${to}`;
             return { rate: this.fixed[key] ?? '1', provider: 'in-memory', isStale: false };
           }
         }
         ```
       - `email-sender.ts`:
         ```ts
         export interface EmailSender { send(args: { to: string; template: string; vars: Record<string, unknown> }): Promise<void>; }
         export class StdoutEmailSender implements EmailSender {
           public sent: Array<{ to: string; template: string; vars: Record<string, unknown> }> = [];
           async send(args: { to: string; template: string; vars: Record<string, unknown> }) {
             // eslint-disable-next-line no-console
             console.log(`[stdout-email] ${args.template} → ${args.to}: ${JSON.stringify(args.vars)}`);
             this.sent.push(args);
           }
         }
         ```
       - `crypto-keys.ts` (InMemory uses identity functions, NO real crypto — Plan 4 ships the libsodium adapter):
         ```ts
         import type { UserId } from '../ids';
         export interface CryptoKeyStore {
           generateUserDek(userId: UserId): Promise<{ cipherDek: Uint8Array; nonce: Uint8Array }>;
           unwrapUserDek(record: { cipherDek: Uint8Array; nonce: Uint8Array }): Promise<Uint8Array>;
           encryptForUser(dek: Uint8Array, plaintext: string): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }>;
           decryptForUser(dek: Uint8Array, record: { ciphertext: Uint8Array; nonce: Uint8Array }): Promise<string>;
           emailHash(email: string): Promise<Uint8Array>;
         }
         export class InMemoryCryptoKeyStore implements CryptoKeyStore {
           async generateUserDek(_uid: UserId) { return { cipherDek: new TextEncoder().encode('dek'), nonce: new Uint8Array(24) }; }
           async unwrapUserDek(_r: { cipherDek: Uint8Array; nonce: Uint8Array }) { return new TextEncoder().encode('dek'); }
           async encryptForUser(_dek: Uint8Array, plaintext: string) {
             return { ciphertext: new TextEncoder().encode(plaintext), nonce: new Uint8Array(24) };
           }
           async decryptForUser(_dek: Uint8Array, record: { ciphertext: Uint8Array; nonce: Uint8Array }) {
             return new TextDecoder().decode(record.ciphertext);
           }
           async emailHash(email: string) { return new TextEncoder().encode(email.toLowerCase()); }
         }
         ```
       - `outbox.ts`:
         ```ts
         import type { TenantId } from '../ids';
         export interface OutboxEvent { tenantId: TenantId; aggregateType: string; aggregateId: string; eventType: string; payload: unknown }
         export interface OutboxWriter { write(tx: unknown, evt: OutboxEvent): Promise<void>; }
         export class InMemoryOutbox implements OutboxWriter {
           public events: OutboxEvent[] = [];
           async write(_tx: unknown, evt: OutboxEvent) { this.events.push(evt); }
         }
         ```
       - `llm-provider.ts`:
         ```ts
         import type { UserId } from '../ids';
         export interface LLMProvider { generateObject<T>(args: { schema: unknown; prompt: string; userId: UserId }): Promise<T>; }
         export class InMemoryLLMProvider implements LLMProvider {
           constructor(private opts: { canned: unknown }) {}
           async generateObject<T>(_args: { schema: unknown; prompt: string; userId: UserId }): Promise<T> { return this.opts.canned as T; }
         }
         ```
       - `stt-provider.ts`:
         ```ts
         export interface STTProvider { transcribe(args: { audio: Uint8Array; language: 'en' | 'pl' | 'uk' }): Promise<{ text: string }>; }
         export class InMemorySTTProvider implements STTProvider {
           constructor(private opts: { canned: string }) {}
           async transcribe(_a: { audio: Uint8Array; language: 'en' | 'pl' | 'uk' }) { return { text: this.opts.canned }; }
         }
         ```
    3. Create `packages/shared-kernel/src/ports/index.ts`:
       ```ts
       export * from './fx-provider';
       export * from './email-sender';
       export * from './crypto-keys';
       export * from './outbox';
       export * from './llm-provider';
       export * from './stt-provider';
       ```
    4. Run tests — confirm GREEN.

  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test packages/shared-kernel/test/ports.test.ts && bunx tsc --noEmit -p packages/shared-kernel/tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - All 6 port files exist: `for f in fx-provider email-sender crypto-keys outbox llm-provider stt-provider; do test -f packages/shared-kernel/src/ports/${f}.ts; done` exits 0
    - `fx-provider.ts` declares FxProvider interface: `grep -F 'export interface FxProvider' packages/shared-kernel/src/ports/fx-provider.ts` exits 0
    - `email-sender.ts` exports StdoutEmailSender: `grep -F 'export class StdoutEmailSender' packages/shared-kernel/src/ports/email-sender.ts` exits 0
    - `crypto-keys.ts` declares all 5 methods: `grep -E '(generateUserDek|unwrapUserDek|encryptForUser|decryptForUser|emailHash)' packages/shared-kernel/src/ports/crypto-keys.ts | wc -l` returns at least 5 (within interface)
    - `outbox.ts` declares OutboxWriter: `grep -F 'OutboxWriter' packages/shared-kernel/src/ports/outbox.ts` exits 0
    - `llm-provider.ts` and `stt-provider.ts` exist: tested by file presence
    - `bun test packages/shared-kernel/test/ports.test.ts` exits 0
    - `bunx tsc --noEmit -p packages/shared-kernel/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>All 6 ports + InMemory fakes shipped and tested. ENGR-13 satisfied for Phase 1 (libsodium adapter ships in Plan 4; all other adapters wire later phases).</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                   | Description                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Process boot → environment | Untrusted env values (could be missing/malformed) cross into typed `env` object        |
| Domain → adapter           | Money / Result / branded IDs are the only types crossing — no leak of ORM types upward |

## STRIDE Threat Register

| Threat ID  | Category               | Component                                                                                      | Disposition | Mitigation Plan                                                                                                                                                                 |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01-01-01 | Tampering              | Float arithmetic on Money silently losing precision (Phase 1 high-severity per CLAUDE.md)      | mitigate    | Money class uses big.js exclusively (no `Number()`); adapter boundary `toDb()/fromDb()` accepts/returns string; ESLint `no-float-money` (Plan 0) blocks float math at lint time |
| T-01-01-02 | Spoofing               | Bare-string TenantId / UserId enabling cross-tenant identifier confusion                       | mitigate    | Branded types `string & { __brand: 'TenantId' }` + helper constructors; tsc rejects bare-string assignments at compile time                                                     |
| T-01-01-03 | Information Disclosure | Missing/malformed BUDGET_KEK at boot causing crypto-shred primitives to silently use empty key | mitigate    | Zod env schema fails-fast on boot if BUDGET_KEK missing or not 44-char base64 (regex check); apps/api/apps/worker/apps/migrator all call `loadEnv()` before any other init      |
| T-01-01-04 | Tampering              | Direct `process.env.X` access bypassing zod validation (drift risk)                            | accept      | First plan only — establishes the contract. Lint rule banning `process.env` outside `env.ts` is a Phase 6 enhancement; documented                                               |
| T-01-01-05 | Information Disclosure | Currency mixing in Money arithmetic producing wrong totals                                     | mitigate    | `Money.add` throws on currency mismatch with explicit message — no silent coercion                                                                                              |

</threat_model>

<verification>
```bash
cd /home/claude/budget
bun test packages/shared-kernel
bunx tsc --noEmit -p packages/shared-kernel/tsconfig.json
bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/shared-kernel
```
All three exit 0.
</verification>

<success_criteria>

- `packages/shared-kernel` exports Money, Clock (System/Fake), Result (neverthrow re-export), TenantId/UserId branded types, env validator, 6 ports + InMemory fakes
- Money fiat (USD) uses 4-decimal NUMERIC(19,4) shape with banker's rounding
- Money crypto (BTC/ETH) uses 18-decimal NUMERIC(38,18) shape
- Money rejects mixed-currency arithmetic at runtime
- Clock port enables ENGR-11 deterministic tests
- Result type ships via neverthrow per ENGR-12
- Branded IDs reject bare strings at compile time per ENGR-05/D-22
- Env zod schema fails-fast on boot per Claude's discretion
- 6 ports (FX, email, crypto, outbox, LLM, STT) + InMemory fakes per ENGR-13
- All tests green; tsc strict passes; dep-cruiser passes
  </success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-01-SUMMARY.md`
</output>
