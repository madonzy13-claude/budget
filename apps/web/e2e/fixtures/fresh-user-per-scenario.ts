import { test as base } from "playwright-bdd";

interface FreshUser {
  email: string;
  password: string;
  userId: string;
  budgetId: string; // == tenantId per v1.1 invariant
  budgetName: string;
}

export type ParsedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

/**
 * Parse a Set-Cookie header line into Playwright's `context.addCookies()` shape.
 * Exported so common-steps.ts can reuse it for the empty-user step.
 */
export function parseSetCookieToPlaywright(
  setCookieLine: string,
  urlForDomain: string,
): ParsedCookie | null {
  const parts = setCookieLine.split(";").map((s) => s.trim());
  const [nv, ...attrs] = parts;
  const eq = nv.indexOf("=");
  if (eq < 0) return null;
  const name = nv.slice(0, eq);
  const value = nv.slice(eq + 1);
  const url = new URL(urlForDomain);
  let path = "/";
  let httpOnly = false;
  let secure = false;
  let sameSite: "Strict" | "Lax" | "None" | undefined = undefined;
  for (const attr of attrs) {
    const [k, v] = attr.split("=").map((s) => s.trim());
    const lk = k.toLowerCase();
    if (lk === "path") path = v ?? "/";
    else if (lk === "httponly") httpOnly = true;
    else if (lk === "secure") secure = true;
    else if (lk === "samesite") {
      const sv = (v ?? "").toLowerCase();
      sameSite = sv === "strict" ? "Strict" : sv === "none" ? "None" : "Lax";
    }
  }
  return {
    name,
    value,
    domain: url.hostname,
    path,
    httpOnly,
    secure,
    sameSite,
  };
}

/**
 * Programmatic Better Auth signup. The web stack proxies `/auth/*` to the API
 * server's Better Auth handler, so a same-origin POST against PLAYWRIGHT_BASE_URL
 * works. Mirrors https://www.better-auth.com/docs/integrations/playwright.
 */
export async function signUpViaHttp(
  baseUrl: string,
  email: string,
  password: string,
  name: string,
): Promise<{ userId: string; setCookieHeaders: string[] }> {
  const res = await fetch(`${baseUrl}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`signUpEmail failed (${res.status}): ${body}`);
  }
  // Node 20+ exposes getSetCookie(); fall back to raw header if absent.
  const headersAny = res.headers as unknown as {
    getSetCookie?: () => string[];
    get: (k: string) => string | null;
  };
  const setCookie =
    typeof headersAny.getSetCookie === "function"
      ? headersAny.getSetCookie()
      : headersAny.get("set-cookie")
        ? [headersAny.get("set-cookie") as string]
        : [];
  const body = (await res.json().catch(() => ({}))) as {
    user?: { id?: string };
    token?: string;
  };
  return { userId: body.user?.id ?? "", setCookieHeaders: setCookie };
}

/** Create a budget via the API using the freshly-acquired session cookies. */
export async function createBudgetViaHttp(
  baseUrl: string,
  cookieHeader: string,
  name: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/budgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({ name, kind: "PRIVATE", default_currency: "USD" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`createBudget failed (${res.status}): ${body}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

export const test = base.extend<{ freshUser: FreshUser }>({
  freshUser: async ({ context, baseURL }, use) => {
    const baseUrl =
      baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const email = `phase3-e2e-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@test.local`;
    const password = "Test1234!Phase3";
    const name = "Phase 3 E2E User";

    // 1. Sign up via Better Auth proxy.
    const { userId, setCookieHeaders } = await signUpViaHttp(
      baseUrl,
      email,
      password,
      name,
    );
    if (!userId) throw new Error("signup did not return a user id");

    // 2. Copy session cookies into the Playwright browser context.
    const cookies = setCookieHeaders
      .map((line) => parseSetCookieToPlaywright(line, baseUrl))
      .filter((c): c is ParsedCookie => c !== null);
    if (cookies.length === 0) {
      throw new Error(
        "signup response had no Set-Cookie headers — Better Auth session cookie cannot be replayed",
      );
    }
    await context.addCookies(cookies);

    // 3. Build a Cookie header for subsequent API calls.
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // 4. Create a budget via the API (auth.api.createOrganization under the hood).
    const budgetName = "My E2E Budget";
    const budgetId = await createBudgetViaHttp(
      baseUrl,
      cookieHeader,
      budgetName,
    );

    await use({ email, password, userId, budgetId, budgetName });
    // Cleanup deferred: CLAUDE.md mandates real PG; dev DB is non-persistent.
  },
});

/** Variant fixture: signed-in user WITHOUT any budgets — for empty-state scenarios. */
export const testEmpty = base.extend<{
  emptyUser: Omit<FreshUser, "budgetId" | "budgetName">;
}>({
  emptyUser: async ({ context, baseURL }, use) => {
    const baseUrl =
      baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const email = `phase3-e2e-empty-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@test.local`;
    const password = "Test1234!Phase3";
    const { userId, setCookieHeaders } = await signUpViaHttp(
      baseUrl,
      email,
      password,
      "Phase 3 Empty",
    );
    const cookies = setCookieHeaders
      .map((line) => parseSetCookieToPlaywright(line, baseUrl))
      .filter((c): c is ParsedCookie => c !== null);
    await context.addCookies(cookies);
    await use({ email, password, userId });
  },
});

export { expect } from "@playwright/test";
