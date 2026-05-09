/**
 * idempotency.test.ts — integration tests for createIdempotencyMiddleware.
 *
 * TDD: RED → GREEN cycle.
 *
 * Tests cover:
 * 1. Body survives middleware → zValidator with original JSON intact (LOCKED Hono v4.12+ invariant)
 * 2. No header → proceeds normally (two independent requests succeed)
 * 3. Replay (same key + same body) → cached response returned verbatim
 * 4. Body-hash mismatch → 422 idempotency_key_reused_with_different_body
 * 5. TTL expired → treats as cache miss (fresh execution)
 * 6. Cross-tenant scope → independent rows (Pitfall 10)
 * 7. Cross-user scope → independent rows (Pitfall 10)
 * 8. GET method → no caching applied even with header
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ok, err } from "@budget/shared-kernel";
import { createHash } from "node:crypto";
import type { IdempotencyDeps } from "../../../../packages/platform/src/idempotency/middleware";
import { createIdempotencyMiddleware } from "../../../../packages/platform/src/idempotency/middleware";

// ── In-memory idempotency store for unit tests ─────────────────────────────
interface StoredRow {
  scopeHash: string;
  bodyHash: string;
  tenantId: string;
  userId: string;
  route: string;
  responseStatus: number;
  responseBodyJsonb: unknown;
  expiresAt: Date;
}
const idempotencyStore = new Map<string, StoredRow>();

function sha256(s: string) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// ── Injectable mock deps (in-memory store, no DB) ─────────────────────────
function makeMockDeps(): IdempotencyDeps {
  return {
    withTenantTx: async (_tenantId, _userId, fn) => {
      try {
        const value = await fn({} as never);
        return ok(value);
      } catch (e) {
        return err(e as Error);
      }
    },
    lookupIdempotency: async (_tx, scopeHash) => {
      const row = idempotencyStore.get(scopeHash);
      if (!row) return null;
      if (row.expiresAt < new Date()) return null; // expired TTL
      return {
        scopeHash: row.scopeHash,
        bodyHash: row.bodyHash,
        responseStatus: row.responseStatus,
        responseBodyJsonb: row.responseBodyJsonb,
        expiresAt: row.expiresAt,
      };
    },
    insertIdempotency: async (_tx, row) => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      idempotencyStore.set(row.scopeHash, {
        scopeHash: row.scopeHash,
        bodyHash: row.bodyHash,
        tenantId: row.tenantId,
        userId: row.userId,
        route: row.route,
        responseStatus: row.responseStatus,
        responseBodyJsonb: row.responseBody,
        expiresAt,
      });
    },
  } as unknown as IdempotencyDeps;
}

// ── Helper: build a test Hono app ─────────────────────────────────────────
const echoSchema = z.object({ amount: z.number(), currency: z.string() });

function buildApp(tenantId: string, userId: string) {
  const app = new Hono();

  // Simulate tenantGuard having run (sets tenantId + userId on context)
  app.use(async (c, next) => {
    c.set("tenantId" as never, tenantId);
    c.set("userId" as never, userId);
    await next();
  });

  // Idempotency middleware — AFTER tenantGuard (Pitfall 2), with mock deps
  app.use(createIdempotencyMiddleware(makeMockDeps()));

  // Echo route using zValidator (body-survival test)
  app.post("/test/echo", zValidator("json", echoSchema), (c) => {
    const body = c.req.valid("json");
    return c.json({ ok: true, body }, 201);
  });

  // Simple POST without zValidator
  app.post("/test/simple", async (c) => {
    return c.json({ ok: true }, 200);
  });

  // GET route — should never be cached
  app.get("/test/get", (c) => c.json({ ok: true }, 200));

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe("createIdempotencyMiddleware", () => {
  beforeEach(() => {
    idempotencyStore.clear();
  });

  afterEach(() => {
    idempotencyStore.clear();
  });

  // Test 1: Body survives middleware → zValidator with original JSON intact
  test("body survives middleware → zValidator with original JSON intact", async () => {
    const app = buildApp("tenant-A", "user-A1");

    const payload = JSON.stringify({ amount: 1234, currency: "USD" });

    // First POST with Idempotency-Key
    const res1 = await app.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "ABC",
      },
      body: payload,
    });
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as {
      ok: boolean;
      body: { amount: number; currency: string };
    };
    expect(body1.ok).toBe(true);
    // zValidator received the original body intact
    expect(body1.body.amount).toBe(1234);
    expect(body1.body.currency).toBe("USD");

    // Second POST with same key + same body → cached replay
    const res2 = await app.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "ABC",
      },
      body: payload,
    });
    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as {
      ok: boolean;
      body: { amount: number; currency: string };
    };
    // Cached response must be byte-equal to first
    expect(body2.ok).toBe(true);
    expect(body2.body.amount).toBe(1234);
    expect(body2.body.currency).toBe("USD");

    // Only 1 row in store (replay, not a new insert)
    expect(idempotencyStore.size).toBe(1);
  });

  // Test 2: No header → proceeds normally (two POSTs with different bodies both succeed)
  test("no Idempotency-Key header → proceeds without caching", async () => {
    const app = buildApp("tenant-A", "user-A1");

    const res1 = await app.request("/test/simple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: 1 }),
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test/simple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: 2 }),
    });
    expect(res2.status).toBe(200);

    // Nothing cached — no header present
    expect(idempotencyStore.size).toBe(0);
  });

  // Test 3: Replay — same key + same body → cached response returned verbatim
  test("replay with same key + body → returns cached response verbatim", async () => {
    const app = buildApp("tenant-A", "user-A1");
    const payload = JSON.stringify({ amount: 500, currency: "EUR" });

    const res1 = await app.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "KEY-REPLAY",
      },
      body: payload,
    });
    expect(res1.status).toBe(201);

    const res2 = await app.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "KEY-REPLAY",
      },
      body: payload,
    });
    expect(res2.status).toBe(201);

    const b2 = (await res2.json()) as {
      ok: boolean;
      body: { amount: number; currency: string };
    };
    expect(b2.body.amount).toBe(500);
    expect(b2.body.currency).toBe("EUR");

    // Only 1 row — second request was a replay, not a new insert
    expect(idempotencyStore.size).toBe(1);
  });

  // Test 4: Body-hash mismatch → 422
  test("body mismatch with same key → 422 idempotency_key_reused_with_different_body", async () => {
    const app = buildApp("tenant-A", "user-A1");

    // First request — seeds the cache
    const res1 = await app.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "MISMATCH-KEY",
      },
      body: JSON.stringify({ amount: 100, currency: "PLN" }),
    });
    expect(res1.status).toBe(201);

    // Second request with same key but different body
    const res2 = await app.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "MISMATCH-KEY",
      },
      body: JSON.stringify({ amount: 999, currency: "PLN" }),
    });

    expect(res2.status).toBe(422);
    const body = (await res2.json()) as { error: string };
    expect(body.error).toBe("idempotency_key_reused_with_different_body");

    // Only 1 row in store (mismatch, original preserved)
    expect(idempotencyStore.size).toBe(1);
  });

  // Test 5: TTL expired → treats as cache miss (fresh execution)
  test("expired cache entry → fresh execution on replay", async () => {
    const app = buildApp("tenant-A", "user-A1");
    const payload = JSON.stringify({ amount: 200, currency: "USD" });

    // Pre-populate store with an expired row
    const scopeHash = sha256("tenant-A|user-A1|/test/echo|TTL-KEY");
    const bodyHash = sha256(payload);

    idempotencyStore.set(scopeHash, {
      scopeHash,
      bodyHash,
      tenantId: "tenant-A",
      userId: "user-A1",
      route: "/test/echo",
      responseStatus: 201,
      responseBodyJsonb: { old: true },
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    });

    // Request should treat expired row as cache miss → fresh execution
    const res = await app.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "TTL-KEY",
      },
      body: payload,
    });

    // Fresh execution → 201 from the route handler
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      body: { amount: number; currency: string };
    };
    expect(body.ok).toBe(true);
    // Fresh response should have the actual data (not the "old" cached value)
    expect(body.body.amount).toBe(200);
  });

  // Test 6: Cross-tenant scope → independent rows (T-2-03-01)
  test("cross-tenant: same key produces independent cache entries", async () => {
    const appA = buildApp("tenant-A", "user-A1");
    const appB = buildApp("tenant-B", "user-B1");

    const payload = JSON.stringify({ amount: 1, currency: "USD" });

    const resA = await appA.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "SHARED-KEY",
      },
      body: payload,
    });
    expect(resA.status).toBe(201);

    const resB = await appB.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "SHARED-KEY",
      },
      body: payload,
    });
    expect(resB.status).toBe(201);

    // 2 independent rows (different scope_hash due to different tenant_id)
    expect(idempotencyStore.size).toBe(2);
  });

  // Test 7: Cross-user scope within same tenant → independent rows (Pitfall 10)
  test("cross-user within same tenant: same key produces independent cache entries", async () => {
    const appA1 = buildApp("tenant-A", "user-A1");
    const appA2 = buildApp("tenant-A", "user-A2");

    const payload = JSON.stringify({ amount: 1, currency: "USD" });

    const resA1 = await appA1.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "SAME-KEY",
      },
      body: payload,
    });
    expect(resA1.status).toBe(201);

    const resA2 = await appA2.request("/test/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "SAME-KEY",
      },
      body: payload,
    });
    expect(resA2.status).toBe(201);

    // 2 independent rows (different scope_hash due to different user_id)
    expect(idempotencyStore.size).toBe(2);
  });

  // Test 8: GET method → no caching applied even with header
  test("GET method → skipped even with Idempotency-Key header", async () => {
    const app = buildApp("tenant-A", "user-A1");

    const res1 = await app.request("/test/get", {
      method: "GET",
      headers: {
        "Idempotency-Key": "GET-KEY",
      },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test/get", {
      method: "GET",
      headers: {
        "Idempotency-Key": "GET-KEY",
      },
    });
    expect(res2.status).toBe(200);

    // No caching for GET — store should be empty
    expect(idempotencyStore.size).toBe(0);
  });
});
