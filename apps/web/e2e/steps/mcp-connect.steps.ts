import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  test,
  createCategoryViaHttp,
} from "../fixtures/fresh-user-per-scenario";
import { fetchWith429Retry } from "../fixtures/fetch-with-429-retry";
import { ConsentPo } from "../page-objects/ConsentPo";
import { ConnectedAppsPo } from "../page-objects/ConnectedAppsPo";
import { SpendingsPo } from "../page-objects/SpendingsPo";
const { Given, When, Then } = createBdd(test);

// A loopback redirect_uri (allowed by validateRedirectUri, 15-05). Nothing
// listens there: page.route answers the navigation and hands us ?code.
const CALLBACK = "http://127.0.0.1:65530/cb";
const CLIENT_NAME = "E2E MCP client";

const consentText = (locale: string) =>
  (
    JSON.parse(
      readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"),
    ) as { oauthConsent: Record<string, string> }
  ).oauthConsent;

const b64url = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString(
    "base64url",
  );

// One scenario per worker at a time: state is reset by the registering step.
let s: {
  clientId: string;
  verifier: string;
  code?: string;
  token?: string;
  categories: Record<string, string>;
  callId?: string;
} = { clientId: "", verifier: "", categories: {} };

async function rpc(
  base: string,
  token: string | undefined,
  method: string,
  params: Record<string, unknown> = {},
) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  let body: any = null;
  // Streamable HTTP may answer as JSON or as one SSE "message" event.
  const data = text.startsWith("event:") || text.startsWith("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("")
    : text;
  try {
    body = JSON.parse(data);
  } catch {
    if (res.ok) throw new Error(`${method}: ${res.status} ${text.slice(0, 300)}`);
  }
  if (res.ok && !body?.result)
    throw new Error(`${method}: ${res.status} ${text.slice(0, 300)}`);
  return { status: res.status, headers: res.headers, body };
}

async function tool(base: string, name: string, args: Record<string, unknown>) {
  const r = await rpc(base, s.token, "tools/call", { name, arguments: args });
  expect(r.status).toBe(200);
  expect(r.body.result?.isError ?? false).toBe(false);
  return r.body.result.structuredContent as Record<string, any>;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

Given(
  "my budget has a category {string}",
  async ({ freshUser }, name: string) => {
    s.categories[name] = await createCategoryViaHttp(
      freshUser.baseUrl,
      freshUser.cookieHeader,
      freshUser.budgetId,
      name,
    );
  },
);

Given(
  "an MCP client registers and starts authorization in {string}",
  async ({ page, context, freshUser, $testInfo }, locale: string) => {
    // Sign-up + DCR may wait out the shared-IP rate limit, then two page loads.
    $testInfo.setTimeout(120_000);
    const base = freshUser.baseUrl;
    // DCR is rate-limited per IP and every worker shares the tunnel's IP.
    const reg = await fetchWith429Retry(() =>
      fetch(`${base}/auth/oauth2/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: CLIENT_NAME,
          redirect_uris: [CALLBACK],
          token_endpoint_auth_method: "none",
        }),
      }),
    );
    expect(reg.status).toBe(201);
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    s = {
      clientId: ((await reg.json()) as { client_id: string }).client_id,
      verifier,
      categories: s.categories,
    };
    const challenge = b64url(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );

    await context.addCookies([
      { name: "budget-locale", value: locale, url: base },
    ]);
    await page.route(`${CALLBACK}**`, (route) => {
      s.code = new URL(route.request().url()).searchParams.get("code") ?? undefined;
      return route.fulfill({ status: 200, body: "ok" });
    });
    const q = new URLSearchParams({
      response_type: "code",
      client_id: s.clientId,
      redirect_uri: CALLBACK,
      state: "st",
      scope: "read write",
      resource: `${base}/mcp`,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    await page.goto(`${base}/auth/oauth2/authorize?${q}`);
    await page.waitForURL(new RegExp(`/${locale}/oauth/consent`), {
      timeout: 15000,
    });
  },
);

Then(
  "the consent page names the client and says it covers all budgets in {string}",
  async ({ page }, locale: string) => {
    const t = consentText(locale);
    const consent = new ConsentPo(page);
    await expect(consent.clientName(CLIENT_NAME)).toBeVisible({ timeout: 15000 });
    await expect(consent.statement(t.allBudgets)).toBeVisible();
    await expect(consent.statement(t.write)).toBeVisible();
  },
);

When("I allow access in {string}", async ({ page }, locale: string) => {
  const consent = new ConsentPo(page);
  await expect(consent.clientName(CLIENT_NAME)).toBeVisible({ timeout: 15000 });
  await consent.allow(consentText(locale).allow);
  await page.waitForURL(`${CALLBACK}**`, { timeout: 15000 });
  expect(s.code).toBeTruthy();
});

When("the client exchanges the code for tokens", async ({ freshUser }) => {
  const base = freshUser.baseUrl;
  const res = await fetch(`${base}/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: s.code!,
      redirect_uri: CALLBACK,
      client_id: s.clientId,
      code_verifier: s.verifier,
      resource: `${base}/mcp`,
    }),
  });
  expect(res.status).toBe(200);
  const t = (await res.json()) as { access_token: string; scope: string };
  expect(t.scope.split(" ")).toEqual(expect.arrayContaining(["read", "write"]));
  s.token = t.access_token;
});

Then(
  "the client lists tools and list_budgets includes my budget",
  async ({ freshUser }) => {
    const base = freshUser.baseUrl;
    const init = await rpc(base, s.token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: CLIENT_NAME, version: "1" },
    });
    expect(init.status).toBe(200);
    const list = await rpc(base, s.token, "tools/list");
    const names = (list.body.result.tools as { name: string }[]).map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(["list_budgets", "add_transactions", "undo"]));
    const budgets = await tool(base, "list_budgets", {});
    expect(budgets.budgets.map((b: any) => b.budget_id)).toContain(freshUser.budgetId);
  },
);

When(
  "the client adds a {float} spending to {string}",
  async ({ freshUser }, amount: number, category: string) => {
    const r = await tool(freshUser.baseUrl, "add_transactions", {
      budget_id: freshUser.budgetId,
      idempotency_key: crypto.randomUUID(),
      rows: [
        {
          date: today(),
          category_id: s.categories[category],
          amount: amount.toFixed(2),
        },
      ],
    });
    s.callId = r.call_id;
    expect(s.callId).toBeTruthy();
  },
);

When("the client undoes that write", async ({ freshUser }) => {
  await tool(freshUser.baseUrl, "undo", { id: s.callId });
});

const spendingRow = async (
  page: import("@playwright/test").Page,
  budgetId: string,
  amount: number,
) => {
  await page.goto(`/en/budgets/${budgetId}/spendings`);
  await new SpendingsPo(page).grid().waitFor({ state: "visible", timeout: 20000 });
  return new SpendingsPo(page).transactionRowByAmount(Math.round(amount * 100));
};

Then(
  "the {float} spending is in my spendings list",
  async ({ page, freshUser }, amount: number) => {
    await expect(await spendingRow(page, freshUser.budgetId, amount)).toBeVisible({
      timeout: 15000,
    });
  },
);

Then(
  "the {float} spending is gone from my spendings list",
  async ({ page, freshUser }, amount: number) => {
    await expect(await spendingRow(page, freshUser.budgetId, amount)).toHaveCount(0, {
      timeout: 15000,
    });
  },
);

When("I open Connected apps", async ({ page }) => {
  await new ConnectedAppsPo(page).open();
});

Then("I see the client in Connected apps", async ({ page }) => {
  const row = new ConnectedAppsPo(page).row(s.clientId);
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row).toContainText(CLIENT_NAME);
});

When("I disconnect the client", async ({ page }) => {
  await new ConnectedAppsPo(page).disconnect(s.clientId);
});

Then("the client is gone from Connected apps", async ({ page }) => {
  await expect(new ConnectedAppsPo(page).row(s.clientId)).toHaveCount(0, {
    timeout: 15000,
  });
});

Then("the next MCP call returns 401", async ({ freshUser }) => {
  const r = await rpc(freshUser.baseUrl, s.token, "tools/call", {
    name: "list_budgets",
    arguments: {},
  });
  expect(r.status).toBe(401);
});

Then("the OAuth discovery documents are served", async ({ freshUser }) => {
  const base = freshUser.baseUrl;
  const pr = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
  expect(pr.status).toBe(200);
  expect(((await pr.json()) as { resource: string }).resource).toBe(`${base}/mcp`);
  const as = await fetch(`${base}/.well-known/oauth-authorization-server/auth`);
  expect(as.status).toBe(200);
  const meta = (await as.json()) as Record<string, unknown>;
  expect(meta.authorization_endpoint).toBeTruthy();
  expect(meta.token_endpoint).toBeTruthy();
  expect(meta.registration_endpoint).toBeTruthy();
});

Then(
  "an MCP call without a token returns 401 with a challenge",
  async ({ freshUser }) => {
    const r = await rpc(freshUser.baseUrl, undefined, "tools/list");
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("resource_metadata=");
  },
);
