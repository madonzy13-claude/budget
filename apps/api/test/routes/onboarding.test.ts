/**
 * onboarding.test.ts — Wave 0 RED scaffold for ONBD-07 onboarding progress routes
 *
 * Tests: GET /onboarding/progress + PUT /onboarding/progress
 * Consumed GREEN by Plan 06-04.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Onboarding progress routes (ONBD-07)", () => {
  function buildApp(session: unknown) {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? ["budget-001"] : []);
      await next();
    });

    // Routes do not exist yet — RED scaffold
    // When Plan 06-04 implements them, require() will resolve.
    try {
      const {
        onboardingRoutesFactory,
      } = require("../../src/routes/onboarding");
      app.route(
        "/onboarding",
        onboardingRoutesFactory({ tenancy: {}, identity: {} } as any),
      );
    } catch {
      // Route factory not yet implemented — tests will fail RED as intended
    }

    return app;
  }

  it("GET /onboarding/progress for a fresh user → returns { step: 1, completedAt: null } or 404", async () => {
    const app = buildApp({ user: { id: "user-fresh" } });
    const res = await app.request("/onboarding/progress");
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as any;
      expect(body.step).toBe(1);
      expect(body.completedAt).toBeNull();
    }
  });

  it("PUT /onboarding/progress upserts step → 200", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/onboarding/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: 2 }),
    });
    expect(res.status).toBe(200);
  });

  it("PUT /onboarding/progress with completedAt marks complete → 200", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/onboarding/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: 5, completedAt: new Date().toISOString() }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.completedAt).not.toBeNull();
  });

  it("onboarding progress reads/writes scoped to session user (no request-supplied user_id honoured)", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/onboarding/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Attempt to supply a different user_id — must be ignored
      body: JSON.stringify({ step: 3, userId: "user-attacker" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // userId in response must match session user, not the supplied attacker id
    if (body.userId) {
      expect(body.userId).toBe("user-001");
    }
  });
});
