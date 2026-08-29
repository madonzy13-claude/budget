/**
 * demo-guard.test.ts
 *
 * Two halves, and the SECOND matters more: a guard that over-matches would
 * silently break real users' password changes and invitations. Every "blocks
 * the demo user" case is paired with "leaves everyone else alone".
 */
import { describe, it, expect, afterEach } from "bun:test";
import { Hono } from "hono";
import { demoGuard } from "../../src/middleware/demo-guard";

const DEMO_USER = "demo-user-id";
const REAL_USER = "someone-else";

const DEMO_ENV = {
  DEMO_SOURCE_TENANT_IDS: "src",
  DEMO_TENANT_IDS: "dst",
  DEMO_USER_ID: DEMO_USER,
};

function setEnv(env: Record<string, string> | null) {
  for (const k of [
    "DEMO_SOURCE_TENANT_IDS",
    "DEMO_TENANT_IDS",
    "DEMO_USER_ID",
  ]) {
    delete process.env[k];
  }
  if (env) Object.assign(process.env, env);
}

afterEach(() => setEnv(null));

function buildApp(userId: string | null) {
  const deps = {
    identity: {
      auth: {
        api: {
          getSession: async () => (userId ? { user: { id: userId } } : null),
        },
      },
    },
  } as any;

  const app = new Hono();
  app.use(demoGuard(deps));
  app.all("*", (c) => c.json({ reached: true }));
  return app;
}

const BLOCKED_CALLS = [
  ["POST", "/auth/change-password"],
  ["POST", "/auth/change-email"],
  ["POST", "/auth/update-user"],
  ["POST", "/auth/delete-user"],
  ["POST", "/budgets/b1/members"],
  ["POST", "/budgets/b1/share-links"],
] as const;

describe("demoGuard", () => {
  it("blocks the demo user on every restricted action", async () => {
    setEnv(DEMO_ENV);
    const app = buildApp(DEMO_USER);
    for (const [method, path] of BLOCKED_CALLS) {
      const res = await app.request(path, { method });
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
      expect((await res.json()).error).toBe("demo_account_restricted");
    }
  });

  it("leaves every other signed-in user completely alone", async () => {
    // The half that protects real accounts. If this ever goes red, the guard is
    // breaking production users, which is far worse than the demo being
    // damageable.
    setEnv(DEMO_ENV);
    const app = buildApp(REAL_USER);
    for (const [method, path] of BLOCKED_CALLS) {
      const res = await app.request(path, { method });
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it("is a total no-op when the demo is not configured", async () => {
    setEnv(null);
    const app = buildApp(DEMO_USER);
    for (const [method, path] of BLOCKED_CALLS) {
      const res = await app.request(path, { method });
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it("never blocks reads, even for the demo user", async () => {
    setEnv(DEMO_ENV);
    const app = buildApp(DEMO_USER);
    for (const path of ["/budgets/b1/members", "/auth/change-password"]) {
      const res = await app.request(path, { method: "GET" });
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it("does not block unrelated writes for the demo user", async () => {
    // The demo has to stay usable — adding an expense is the whole pitch.
    setEnv(DEMO_ENV);
    const app = buildApp(DEMO_USER);
    for (const path of [
      "/budgets/b1/transactions",
      "/budgets/b1/categories",
      "/settings",
    ]) {
      const res = await app.request(path, { method: "POST" });
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it("blocks an anonymous caller no more than it blocks a real one", async () => {
    setEnv(DEMO_ENV);
    const app = buildApp(null);
    const res = await app.request("/auth/change-password", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
