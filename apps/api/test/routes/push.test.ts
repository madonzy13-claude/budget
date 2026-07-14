/**
 * push.test.ts — Integration tests for push subscribe/unsubscribe/prefs routes (PWAX-04).
 *
 * Boots push-repo functions against real Postgres, mounts the /push sub-router,
 * and asserts:
 *   - POST /push/subscribe upserts → {ok: true}
 *   - POST /push/subscribe without session → 401
 *   - DELETE /push/subscribe removes subscription
 *   - GET /push/preferences?budgetId returns 3-kind toggles (default enabled=true)
 *   - PATCH /push/preferences upserts one pref
 *   - PATCH without session → 401
 *
 * Requires DATABASE_URL_APP (set by `infisical run` or `make test`).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  budgetId: string;
}

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Push Test', true, now(), now())`,
      [userId, `push-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Push Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-push-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId };
}

/**
 * Build a minimal Hono app with push routes and stubbed session/tenant middleware.
 * unauthenticated=true → no session injected (tests 401 paths).
 */
async function buildApp(opts: {
  userId: string;
  tenantId: string;
  unauthenticated?: boolean;
}) {
  const { createPushRoute } = await import("../../src/routes/push");

  const app = new Hono();
  app.use("*", async (c, next) => {
    if (!opts.unauthenticated) {
      c.set("session", { user: { id: opts.userId } });
    }
    c.set("tenantIds", [opts.tenantId]);
    await next();
  });
  // createPushRoute accepts BootedDeps but uses none of them (all ops go direct to DB).
  app.route("/push", createPushRoute({} as any));
  return app;
}

describe("POST /push/subscribe", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("upserts a subscription and returns {ok: true}", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const endpoint = `https://fcm.example.com/sub/${crypto.randomUUID()}`;
    const res = await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtBgBvnWUfPcRH41u7Wp",
        auth: "tBHItJI5svbpez7KI4CCXg",
        budgetId: fix.budgetId,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("upserts the same endpoint again without error (idempotent)", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const endpoint = `https://fcm.example.com/sub/${crypto.randomUUID()}`;
    const payload = {
      endpoint,
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtBgBvnWUfPcRH41u7Wp",
      auth: "tBHItJI5svbpez7KI4CCXg",
      budgetId: fix.budgetId,
    };
    // First call
    await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // Second call (upsert)
    const res = await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, p256dh: "NEW_KEY_AFTER_ROTATION" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 403 when budgetId is not one of the caller's tenants", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const res = await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: `https://fcm.example.com/sub/${crypto.randomUUID()}`,
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtBgBvnWUfPcRH41u7Wp",
        auth: "tBHItJI5svbpez7KI4CCXg",
        budgetId: crypto.randomUUID(), // not in tenantIds
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 401 when no session", async () => {
    const app = await buildApp({
      userId: fix.userId,
      tenantId: fix.budgetId,
      unauthenticated: true,
    });
    const res = await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://fcm.example.com/sub/nope",
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtBgBvnWUfPcRH41u7Wp",
        auth: "tBHItJI5svbpez7KI4CCXg",
        budgetId: fix.budgetId,
      }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });
});

describe("DELETE /push/subscribe", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("removes a subscription and returns {ok: true}", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const endpoint = `https://fcm.example.com/sub/${crypto.randomUUID()}`;

    // Subscribe first
    await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtBgBvnWUfPcRH41u7Wp",
        auth: "tBHItJI5svbpez7KI4CCXg",
        budgetId: fix.budgetId,
      }),
    });

    // Now unsubscribe
    const res = await app.request("/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, budgetId: fix.budgetId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 401 when no session", async () => {
    const app = await buildApp({
      userId: fix.userId,
      tenantId: fix.budgetId,
      unauthenticated: true,
    });
    const res = await app.request("/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://fcm.example.com/sub/nope",
        budgetId: fix.budgetId,
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /push/subscription-status (per-budget master)", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("reflects per-budget subscription state — true only for the subscribed budget", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const endpoint = `https://fcm.example.com/sub/${crypto.randomUUID()}`;

    // Before subscribing: status false.
    const before = await app.request(
      `/push/subscription-status?budgetId=${fix.budgetId}&endpoint=${encodeURIComponent(endpoint)}`,
    );
    expect(before.status).toBe(200);
    expect(((await before.json()) as { subscribed: boolean }).subscribed).toBe(
      false,
    );

    // Subscribe this device for this budget.
    await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtBgBvnWUfPcRH41u7Wp",
        auth: "tBHItJI5svbpez7KI4CCXg",
        budgetId: fix.budgetId,
      }),
    });

    // After subscribing: status true for THIS budget.
    const after = await app.request(
      `/push/subscription-status?budgetId=${fix.budgetId}&endpoint=${encodeURIComponent(endpoint)}`,
    );
    expect(((await after.json()) as { subscribed: boolean }).subscribed).toBe(
      true,
    );

    // A DIFFERENT budget (other tenant) the same device never enabled → false.
    const other = await createFixture();
    const otherApp = await buildApp({
      userId: other.userId,
      tenantId: other.budgetId,
    });
    const otherStatus = await otherApp.request(
      `/push/subscription-status?budgetId=${other.budgetId}&endpoint=${encodeURIComponent(endpoint)}`,
    );
    expect(
      ((await otherStatus.json()) as { subscribed: boolean }).subscribed,
    ).toBe(false);
  });

  it("returns false after the per-budget subscription is deleted", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const endpoint = `https://fcm.example.com/sub/${crypto.randomUUID()}`;
    await app.request("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtBgBvnWUfPcRH41u7Wp",
        auth: "tBHItJI5svbpez7KI4CCXg",
        budgetId: fix.budgetId,
      }),
    });
    await app.request("/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, budgetId: fix.budgetId }),
    });
    const res = await app.request(
      `/push/subscription-status?budgetId=${fix.budgetId}&endpoint=${encodeURIComponent(endpoint)}`,
    );
    expect(((await res.json()) as { subscribed: boolean }).subscribed).toBe(
      false,
    );
  });

  it("returns 401 when no session", async () => {
    const app = await buildApp({
      userId: fix.userId,
      tenantId: fix.budgetId,
      unauthenticated: true,
    });
    const res = await app.request(
      `/push/subscription-status?budgetId=${fix.budgetId}&endpoint=https%3A%2F%2Fx`,
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /push/preferences", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("returns all kinds by default; known kinds ON, BADGE OFF (opt-in)", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const res = await app.request(`/push/preferences?budgetId=${fix.budgetId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preferences: Array<{ notificationType: string; enabled: boolean }>;
    };
    const kinds = body.preferences.map((p) => p.notificationType).sort();
    expect(kinds).toEqual(
      [
        "BADGE",
        "BUDGET_REMINDER",
        "CONFIRM_DRAFT",
        "CUSHION_BELOW_TARGET",
        "INCOME_UNDER_PLANNED",
        "RESERVE_TOPUP",
        "TASK_COMPLETED",
      ].sort(),
    );
    // Every kind defaults ON except the opt-in BADGE.
    for (const pref of body.preferences) {
      expect(pref.enabled).toBe(pref.notificationType !== "BADGE");
    }
  });

  it("returns 401 when no session", async () => {
    const app = await buildApp({
      userId: fix.userId,
      tenantId: fix.budgetId,
      unauthenticated: true,
    });
    const res = await app.request(`/push/preferences?budgetId=${fix.budgetId}`);
    expect(res.status).toBe(401);
  });

  it("returns 400 when budgetId is missing", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const res = await app.request("/push/preferences");
    expect(res.status).toBe(400);
  });
});

describe("PATCH /push/preferences", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("upserts a preference and returns {ok: true}", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });
    const res = await app.request("/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetId: fix.budgetId,
        notificationType: "RESERVE_TOPUP",
        enabled: false,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("reflects the upserted value in subsequent GET", async () => {
    const app = await buildApp({ userId: fix.userId, tenantId: fix.budgetId });

    // Disable CUSHION_BELOW_TARGET
    await app.request("/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetId: fix.budgetId,
        notificationType: "CUSHION_BELOW_TARGET",
        enabled: false,
      }),
    });

    const res = await app.request(`/push/preferences?budgetId=${fix.budgetId}`);
    const body = (await res.json()) as {
      preferences: Array<{ notificationType: string; enabled: boolean }>;
    };
    const cushionPref = body.preferences.find(
      (p) => p.notificationType === "CUSHION_BELOW_TARGET",
    );
    expect(cushionPref?.enabled).toBe(false);
  });

  it("returns 401 when no session", async () => {
    const app = await buildApp({
      userId: fix.userId,
      tenantId: fix.budgetId,
      unauthenticated: true,
    });
    const res = await app.request("/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetId: fix.budgetId,
        notificationType: "RESERVE_TOPUP",
        enabled: true,
      }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });
});
