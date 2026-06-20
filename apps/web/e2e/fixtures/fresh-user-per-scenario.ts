import { test as base } from "playwright-bdd";
import { fetchWith429Retry } from "./fetch-with-429-retry";

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

function extractSetCookies(headers: Headers): string[] {
  const headersAny = headers as unknown as {
    getSetCookie?: () => string[];
    get: (k: string) => string | null;
  };
  if (typeof headersAny.getSetCookie === "function") {
    return headersAny.getSetCookie();
  }
  const single = headersAny.get("set-cookie");
  return single ? [single] : [];
}

function mailpitBaseUrl(): string {
  return process.env.MAILPIT_URL ?? "http://localhost:8025";
}

interface MailpitMessageMeta {
  ID: string;
  Subject?: string;
  To?: Array<{ Address?: string }>;
}
interface MailpitMessageBody {
  HTML?: string;
  Text?: string;
}

/**
 * Poll mailpit for the most recent verification email addressed to {email} and
 * return the verification URL embedded in the message body. Better Auth is
 * configured with `requireEmailVerification: true` + `autoSignIn: false`
 * (better-auth.ts) so the signup POST issues NO session cookie — the cookie is
 * only minted when the user follows the verify URL (`autoSignInAfterVerification`).
 * This poller closes that gap for the programmatic E2E fixture.
 */
async function fetchVerificationUrl(
  email: string,
  baseUrl: string,
): Promise<string> {
  const mailpit = mailpitBaseUrl();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const list = (await fetch(
      `${mailpit}/api/v1/messages?query=to:${encodeURIComponent(email)}`,
    )
      .then((r) => r.json() as Promise<{ messages?: MailpitMessageMeta[] }>)
      .catch(() => ({}))) as { messages?: MailpitMessageMeta[] };
    const msg = list.messages?.find(
      (m) =>
        m.To?.[0]?.Address === email &&
        typeof m.Subject === "string" &&
        m.Subject.toLowerCase().includes("verify"),
    );
    if (msg) {
      const detail = (await fetch(`${mailpit}/api/v1/message/${msg.ID}`).then(
        (r) => r.json() as Promise<MailpitMessageBody>,
      )) as MailpitMessageBody;
      const body = detail.HTML ?? detail.Text ?? "";
      // Better Auth verify URL pattern: <BASE>/auth/verify-email?token=...&callbackURL=...
      const m1 = body.match(/https?:\/\/[^\s"'<>]+verify-email[^\s"'<>]*/);
      if (m1) return m1[0];
      const m2 = body.match(
        /https?:\/\/[^\s"'<>]+\/auth\/[^\s"'<>]+token=[^\s"'<>]+/,
      );
      if (m2) return m2[0];
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // Fallback hint: caller's baseUrl is unused except for diagnostics.
  void baseUrl;
  throw new Error(
    `mailpit verification email never arrived for ${email} (15s)`,
  );
}

/**
 * Follow the verify URL through any redirect chain, accumulating the session
 * cookie set by Better Auth (`autoSignInAfterVerification`). Returns the parsed
 * cookies in `addCookies()` shape.
 */
async function followVerifyChain(
  verifyUrl: string,
  baseUrl: string,
): Promise<ParsedCookie[]> {
  const collected: ParsedCookie[] = [];
  let location: string | null = verifyUrl;
  let safety = 6;
  let cookieHeader = "";
  while (location && safety-- > 0) {
    const url = new URL(location, baseUrl).toString();
    const res: Response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        Origin: baseUrl,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });
    const setCookies = extractSetCookies(res.headers);
    for (const line of setCookies) {
      const parsed = parseSetCookieToPlaywright(line, baseUrl);
      if (parsed) collected.push(parsed);
    }
    cookieHeader = collected.map((c) => `${c.name}=${c.value}`).join("; ");
    location = res.headers.get("location");
  }
  return collected;
}

/**
 * Programmatic Better Auth signup followed by mailpit-driven email verification
 * so the fixture obtains a real session cookie. The web stack proxies
 * `/auth/*` to the API server's Better Auth handler, so a same-origin POST
 * against PLAYWRIGHT_BASE_URL works. Origin header is set explicitly because
 * Better Auth gates non-trusted origins via `trustedOrigins`.
 */
export async function signUpViaHttp(
  baseUrl: string,
  email: string,
  password: string,
  name: string,
): Promise<{ userId: string; setCookieHeaders: string[] }> {
  const res = await fetchWith429Retry(() =>
    fetch(`${baseUrl}/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ email, password, name }),
    }),
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`signUpEmail failed (${res.status}): ${body}`);
  }
  const body = (await res.json().catch(() => ({}))) as {
    user?: { id?: string };
  };
  const userId = body.user?.id ?? "";
  if (!userId) {
    throw new Error("signup did not return a user id");
  }

  // Better Auth: requireEmailVerification=true + autoSignIn=false. The signup
  // POST cannot return a session cookie. Walk through mailpit to get the
  // verification URL, follow it (autoSignInAfterVerification mints the cookie).
  const verifyUrl = await fetchVerificationUrl(email, baseUrl);
  const cookies = await followVerifyChain(verifyUrl, baseUrl);
  if (cookies.length === 0) {
    throw new Error(
      `verify-email chain produced no cookies — autoSignInAfterVerification did not engage for ${email}`,
    );
  }
  const setCookieHeaders = cookies.map(
    (c) =>
      `${c.name}=${c.value}; Path=${c.path}; Domain=${c.domain}${c.httpOnly ? "; HttpOnly" : ""}${c.secure ? "; Secure" : ""}${c.sameSite ? `; SameSite=${c.sameSite}` : ""}`,
  );
  return { userId, setCookieHeaders };
}

/** Create a recurring rule via the API — materialises a pending draft for the current month. */
export async function createRecurringRuleViaHttp(
  baseUrl: string,
  cookieHeader: string,
  budgetId: string,
  opts: {
    note: string;
    amount: string; // decimal string e.g. "1000.00"
    currency: string;
    firstDueDate: string; // YYYY-MM-DD
    cadenceAnchor: number; // 1-31
    categoryId: string; // draft must have a real category or the grid drops it
  },
): Promise<string> {
  const res = await fetch(
    `${baseUrl}/api/budgets/${budgetId}/recurring-rules`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
        Origin: baseUrl,
        "X-Budget-ID": budgetId,
      },
      body: JSON.stringify({
        category_id: opts.categoryId,
        amount: opts.amount,
        currency: opts.currency,
        note: opts.note,
        first_due_date: opts.firstDueDate,
        cadence: "MONTHLY",
        cadence_anchor: opts.cadenceAnchor,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`createRecurringRule failed (${res.status}): ${body}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** Create a category via the API; returns the new category id. */
export async function createCategoryViaHttp(
  baseUrl: string,
  cookieHeader: string,
  budgetId: string,
  name: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/budgets/${budgetId}/categories`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      Origin: baseUrl,
      "X-Budget-ID": budgetId,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`createCategory failed (${res.status}): ${body}`);
  }
  const body = (await res.json()) as { id?: string; category?: { id: string } };
  return body.id ?? body.category?.id ?? "";
}

/** Create a budget via the API using the freshly-acquired session cookies. */
export async function createBudgetViaHttp(
  baseUrl: string,
  cookieHeader: string,
  name: string,
  kind: "PRIVATE" | "SHARED" = "PRIVATE",
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/budgets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      Origin: baseUrl,
    },
    body: JSON.stringify({ name, kind, default_currency: "USD" }),
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

    // 1. Sign up + verify via mailpit so a session cookie exists.
    const { userId, setCookieHeaders } = await signUpViaHttp(
      baseUrl,
      email,
      password,
      name,
    );

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

    // 4. Create a budget via the API.
    const budgetName = "My E2E Budget";
    const budgetId = await createBudgetViaHttp(
      baseUrl,
      cookieHeader,
      budgetName,
    );

    await use({ email, password, userId, budgetId, budgetName });
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

/** Variant fixture: signed-in user with a SHARED budget — for share-link scenarios. */
export const testSharedUser = base.extend<{ sharedUser: FreshUser }>({
  sharedUser: async ({ context, baseURL }, use) => {
    const baseUrl =
      baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const email = `phase8-e2e-shared-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@test.local`;
    const password = "Test1234!Phase8";
    const name = "Phase 8 Shared User";

    // 1. Sign up + verify via mailpit so a session cookie exists.
    const { userId, setCookieHeaders } = await signUpViaHttp(
      baseUrl,
      email,
      password,
      name,
    );

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

    // 4. Create a SHARED budget via the API (Members section requires SHARED kind).
    const budgetName = "My E2E Budget";
    const budgetId = await createBudgetViaHttp(
      baseUrl,
      cookieHeader,
      budgetName,
      "SHARED",
    );

    await use({ email, password, userId, budgetId, budgetName });
  },
});

export { expect } from "@playwright/test";
