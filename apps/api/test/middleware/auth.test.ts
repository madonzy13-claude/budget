/**
 * auth.test.ts — unit tests for authMiddleware
 * Mocks identity.auth.api.getSession to test session resolution.
 */
import { describe, it, expect, mock } from "bun:test";
import { Hono } from "hono";

describe("authMiddleware", () => {
  it("sets session to null when getSession returns null", async () => {
    const mockGetSession = mock(async () => null);
    const { authMiddleware } = await import("../../src/middleware/auth");

    const fakeDeps = {
      identity: {
        auth: {
          api: { getSession: mockGetSession },
        },
      },
    } as any;

    const app = new Hono();
    app.use(authMiddleware(fakeDeps));
    app.get("/test", (c) => c.json({ session: c.get("session") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { session: unknown };
    expect(body.session).toBeNull();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("sets session when getSession returns a session object", async () => {
    const fakeSession = {
      user: { id: "user-abc", email: "user@test.com", locale: "pl" },
    };
    const mockGetSession = mock(async () => fakeSession);
    const { authMiddleware } = await import("../../src/middleware/auth");

    const fakeDeps = {
      identity: {
        auth: {
          api: { getSession: mockGetSession },
        },
      },
    } as any;

    const app = new Hono();
    app.use(authMiddleware(fakeDeps));
    app.get("/test", (c) => c.json({ session: c.get("session") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { session: typeof fakeSession };
    expect(body.session?.user.id).toBe("user-abc");
    expect(body.session?.user.locale).toBe("pl");
  });

  it("sets session to null when getSession returns undefined", async () => {
    const mockGetSession = mock(async () => undefined);
    const { authMiddleware } = await import("../../src/middleware/auth");

    const fakeDeps = {
      identity: {
        auth: {
          api: { getSession: mockGetSession },
        },
      },
    } as any;

    const app = new Hono();
    app.use(authMiddleware(fakeDeps));
    app.get("/test", (c) => c.json({ hasSession: c.get("session") !== null }));

    const res = await app.request("/test");
    const body = (await res.json()) as { hasSession: boolean };
    expect(body.hasSession).toBe(false);
  });
});
