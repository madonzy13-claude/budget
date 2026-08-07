/**
 * settings.test.ts — integration tests for /settings routes.
 * ENGR-03: route coverage sentinel.
 *
 * Tests auth guards and basic validation using in-process Hono app.
 */
import { describe, test, expect, mock } from "bun:test";
import { Hono } from "hono";

class FakePgBoss {
  async start() {
    return this;
  }
  async work() {}
  async schedule() {}
  async createQueue() {}
  async send() {}
  async stop() {}
}
mock.module("pg-boss", () => ({
  default: FakePgBoss,
  PgBoss: FakePgBoss,
}));

const { settingsRoutesFactory } = await import("../../src/routes/settings");

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    identity: {
      userRepo: {
        async updateLocale() {},
        async updateDisplayCurrency() {},
        async updateTimezone() {},
        async updateTheme() {},
      },
      auth: {
        api: {
          async listSessions() {
            return [];
          },
          async revokeSession() {},
        },
      },
      ...overrides,
    },
  } as any;
}

function buildApp(deps = buildDeps()) {
  const app = new Hono<{ Variables: Record<string, unknown> }>();
  app.use("*", async (c, next) => {
    // inject session for authenticated requests
    if (c.req.header("X-Test-Auth") === "true") {
      c.set("session", { user: { id: "user-123" } });
    }
    await next();
  });
  app.route("/settings", settingsRoutesFactory(deps));
  return app;
}

describe("GET /settings/sessions", () => {
  test("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/settings/sessions");
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe("unauthorized");
  });

  test("returns sessions array when authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/settings/sessions", {
      headers: { "X-Test-Auth": "true" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.sessions)).toBe(true);
  });
});

describe("PUT /settings/locale", () => {
  test("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/settings/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "en" }),
    });
    expect(res.status).toBe(401);
  });

  test("accepts valid locale", async () => {
    const app = buildApp();
    const res = await app.request("/settings/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ locale: "pl" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("rejects invalid locale with 400", async () => {
    const app = buildApp();
    const res = await app.request("/settings/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ locale: "xx" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /settings/display-currency", () => {
  test("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/settings/display-currency", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "USD" }),
    });
    expect(res.status).toBe(401);
  });

  test("accepts valid ISO currency code", async () => {
    const app = buildApp();
    const res = await app.request("/settings/display-currency", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ currency: "EUR" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("rejects non-3-letter currency with 400", async () => {
    const app = buildApp();
    const res = await app.request("/settings/display-currency", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ currency: "us" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /settings/timezone", () => {
  test("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/settings/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: "Europe/Warsaw" }),
    });
    expect(res.status).toBe(401);
  });

  test("accepts a valid IANA timezone", async () => {
    const app = buildApp();
    const res = await app.request("/settings/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ timezone: "Europe/Warsaw" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("rejects an invalid timezone with 400", async () => {
    const app = buildApp();
    const res = await app.request("/settings/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ timezone: "Mars/Olympus_Mons" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /settings/theme", () => {
  test("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/settings/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "light" }),
    });
    expect(res.status).toBe(401);
  });

  test("accepts a valid theme", async () => {
    const app = buildApp();
    const res = await app.request("/settings/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ theme: "light" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("rejects an invalid theme with 400", async () => {
    const app = buildApp();
    const res = await app.request("/settings/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ theme: "sepia" }),
    });
    expect(res.status).toBe(400);
  });
});

// 0074: UI picks that follow the PERSON but belong to no single budget — the
// all-budgets range selector, so far. Budget-scoped picks live on the member
// row instead (0070 / /budgets/:id/ui-prefs).
describe("/settings/ui-prefs", () => {
  function prefsDeps(store: Record<string, string[]> = {}) {
    return buildDeps({
      userRepo: {
        async updateLocale() {},
        async updateDisplayCurrency() {},
        async updateTimezone() {},
        async updateTheme() {},
        async getUserUiPrefs() {
          return store;
        },
        async mergeUserUiPrefs(_id: string, patch: Record<string, string[]>) {
          Object.assign(store, patch);
          return store;
        },
      },
    });
  }

  test("refuses to read anyone's preferences without a session", async () => {
    const res = await buildApp(prefsDeps()).request("/settings/ui-prefs");
    expect(res.status).toBe(401);
  });

  test("refuses to write without a session", async () => {
    const res = await buildApp(prefsDeps()).request("/settings/ui-prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefs: { overviewRange: ["last3Months"] } }),
    });
    expect(res.status).toBe(401);
  });

  test("gives back the caller's own stored picks", async () => {
    const res = await buildApp(
      prefsDeps({ overviewRange: ["last3Months"] }),
    ).request("/settings/ui-prefs", { headers: { "X-Test-Auth": "true" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      prefs: { overviewRange: ["last3Months"] },
    });
  });

  test("merges a patch rather than replacing the bag", async () => {
    const store = { somethingElse: ["kept"] };
    const app = buildApp(prefsDeps(store));
    const res = await app.request("/settings/ui-prefs", {
      method: "PUT",
      headers: { "content-type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ prefs: { overviewRange: ["last6Months"] } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      prefs: { somethingElse: ["kept"], overviewRange: ["last6Months"] },
    });
  });

  test("refuses a body that is not a bag of string lists", async () => {
    const app = buildApp(prefsDeps());
    const res = await app.request("/settings/ui-prefs", {
      method: "PUT",
      headers: { "content-type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ prefs: { overviewRange: "last6Months" } }),
    });
    expect(res.status).toBe(400);
  });
});
