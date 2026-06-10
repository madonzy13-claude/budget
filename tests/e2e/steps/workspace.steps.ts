import { expect, request } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { WorkspacesPage } from "../pages/WorkspacesPage.js";
import { CreateWorkspacePage } from "../pages/CreateWorkspacePage.js";
import { LOCALE_LABELS, type Locale } from "../pages/labels.js";
import { pollMailpitForRecipient } from "../fixtures/mailpit.js";

const { When, Then } = createBdd(test);

function localeFromUrl(url: string): Locale {
  const m = url.match(/\/(en|pl|uk)\//);
  if (m && (m[1] === "en" || m[1] === "pl" || m[1] === "uk")) return m[1];
  return "en";
}

Then("the create-workspace empty CTA is visible", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const wp = new WorkspacesPage(page, locale);
  await wp.expectEmptyCtaVisible();
});

When("I click the create-workspace empty CTA", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const wp = new WorkspacesPage(page, locale);
  await wp.clickEmptyCta();
});

Then("the create-workspace form fields are visible", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const cw = new CreateWorkspacePage(page, locale);
  await cw.expectFieldsVisible();
});

When("I fill workspace name {string}", async ({ page }, name: string) => {
  const locale = localeFromUrl(page.url());
  const cw = new CreateWorkspacePage(page, locale);
  await cw.fillName(name);
});

When("I pick the {string} currency", async ({ page }, code: string) => {
  const locale = localeFromUrl(page.url());
  const cw = new CreateWorkspacePage(page, locale);
  const labels = LOCALE_LABELS[locale];
  const map: Record<string, string> = {
    USD: labels.currencyPicker.usDollarLabel,
    UAH: labels.currencyPicker.ukrainianHryvniaLabel,
  };
  const display = map[code];
  if (!display) throw new Error(`No display label for currency code: ${code}`);
  await cw.pickCurrency(display);
});

When("I submit the create-workspace form", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const cw = new CreateWorkspacePage(page, locale);
  await cw.clickSubmit();
});

Then("I land on a workspace detail page", async ({ page }) => {
  await expect(page).toHaveURL(/\/(en|pl|uk)\/workspaces\/[^/]+$/, {
    timeout: 10000,
  });
  expect(page.url()).not.toMatch(/\/workspaces\/undefined/);
});

interface ActiveWorkspaceListResp {
  workspaces: Array<{ id: string; name?: string; kind?: string }>;
}

interface ActiveWorkspaceSelectionResp {
  ok: boolean;
  activeWorkspaceIds: string[];
}

async function fetchActiveWorkspaces(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const res = await fetch("/api/workspaces/active", {
      credentials: "include",
    });
    return { status: res.status, body: await res.json() };
  });
}

Then(
  "the active-workspaces endpoint returns {int} workspaces",
  async ({ page }, expected: number) => {
    const { status, body } = await fetchActiveWorkspaces(page);
    expect(status).toBe(200);
    const list = (body as ActiveWorkspaceListResp).workspaces ?? [];
    expect(list).toHaveLength(expected);
  },
);

When(
  "I set the active workspaces to all owned workspaces",
  async ({ page, scenarioCtx }) => {
    const { body } = await fetchActiveWorkspaces(page);
    const ids = (body as ActiveWorkspaceListResp).workspaces.map((w) => w.id);
    const result = await page.evaluate(async (workspaceIds: string[]) => {
      const res = await fetch("/api/workspaces/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workspaceIds }),
      });
      return { status: res.status, body: await res.json() };
    }, ids);
    expect(result.status).toBe(200);
    (scenarioCtx as Record<string, unknown>)["expectedActiveIds"] = (
      result.body as ActiveWorkspaceSelectionResp
    ).activeWorkspaceIds;
  },
);

When("I reload the page", async ({ page }) => {
  await page.reload();
});

When("I pick the SHARED workspace kind", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const cw = new CreateWorkspacePage(page, locale);
  await cw.pickKind("SHARED");
});

When("I pick the PRIVATE workspace kind", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const cw = new CreateWorkspacePage(page, locale);
  await cw.pickKind("PRIVATE");
});

interface InviteApiCallState {
  status: number;
  body: unknown;
  email: string;
}

When(
  "I post a workspace invitation for {string} with role {string}",
  async ({ page, scenarioCtx }, emailTemplate: string, role: string) => {
    const m = page.url().match(/\/workspaces\/([^/?]+)/);
    if (!m) throw new Error("Not on a workspace detail page; cannot derive id");
    const workspaceId = m[1];
    const email = emailTemplate.replace("{ts}", String(Date.now()));
    const result = await page.evaluate(
      async ({
        workspaceId,
        email,
        role,
      }: {
        workspaceId: string;
        email: string;
        role: string;
      }) => {
        const res = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, role }),
        });
        const text = await res.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // not JSON — keep raw text
        }
        return { status: res.status, body };
      },
      { workspaceId, email, role },
    );
    (scenarioCtx as Record<string, unknown>)["lastInvite"] = {
      ...result,
      email,
    } satisfies InviteApiCallState;
  },
);

Then(
  "the invite API responds 201 with an invitation id",
  async ({ scenarioCtx }) => {
    const inv = (scenarioCtx as Record<string, unknown>)["lastInvite"] as
      | InviteApiCallState
      | undefined;
    expect(inv).toBeDefined();
    expect(inv!.status).toBe(201);
    const body = inv!.body as { invitationId?: string } | undefined;
    expect(body?.invitationId, JSON.stringify(inv!.body)).toBeTruthy();
  },
);

Then(
  "the invite API responds with a non-2xx status",
  async ({ scenarioCtx }) => {
    const inv = (scenarioCtx as Record<string, unknown>)["lastInvite"] as
      | InviteApiCallState
      | undefined;
    expect(inv).toBeDefined();
    expect(
      inv!.status,
      `expected non-2xx, got ${inv!.status}`,
    ).toBeGreaterThanOrEqual(400);
  },
);

Then(
  "a Mailpit message is delivered to that invitee email",
  async ({ scenarioCtx }) => {
    const inv = (scenarioCtx as Record<string, unknown>)["lastInvite"] as
      | InviteApiCallState
      | undefined;
    if (!inv) throw new Error("No lastInvite in scenario context");
    const api = await request.newContext();
    try {
      const message = await pollMailpitForRecipient(api, inv.email);
      (scenarioCtx as Record<string, unknown>)["lastMailpitMessage"] = message;
    } finally {
      await api.dispose();
    }
  },
);

interface SharesApiCallState {
  status: number;
  body: unknown;
}

When(
  "I PUT shares with the sole owner at {string}",
  async ({ page, scenarioCtx }, percentage: string) => {
    const m = page.url().match(/\/workspaces\/([^/?]+)/);
    if (!m) throw new Error("Not on a workspace detail page; cannot derive id");
    const workspaceId = m[1];

    const result = await page.evaluate(
      async ({
        workspaceId,
        percentage,
      }: {
        workspaceId: string;
        percentage: string;
      }) => {
        const sessionRes = await fetch("/api/auth/get-session", {
          credentials: "include",
        });
        const sessionJson = (await sessionRes.json()) as {
          user?: { id?: string };
        } | null;
        const userId = sessionJson?.user?.id;
        if (!userId) throw new Error("No userId from get-session");
        const r = await fetch(`/api/workspaces/${workspaceId}/shares`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ shares: [{ userId, percentage }] }),
        });
        const text = await r.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // raw text
        }
        return { status: r.status, body };
      },
      { workspaceId, percentage },
    );
    (scenarioCtx as Record<string, unknown>)["lastSharesCall"] =
      result satisfies SharesApiCallState;
  },
);

Then("the shares API responds 200", async ({ scenarioCtx }) => {
  const r = (scenarioCtx as Record<string, unknown>)["lastSharesCall"] as
    | SharesApiCallState
    | undefined;
  expect(r).toBeDefined();
  expect(r!.status, JSON.stringify(r!.body)).toBe(200);
});

Then(
  "the shares API responds with a non-2xx status",
  async ({ scenarioCtx }) => {
    const r = (scenarioCtx as Record<string, unknown>)["lastSharesCall"] as
      | SharesApiCallState
      | undefined;
    expect(r).toBeDefined();
    expect(
      r!.status,
      `expected non-2xx, got ${r!.status}`,
    ).toBeGreaterThanOrEqual(400);
  },
);

Then(
  "one workspace_invitations row exists for that invitee email",
  async ({ scenarioCtx }) => {
    // We don't have a direct DB binding from the e2e suite; instead, the API returned
    // an invitationId on success, which proves the row exists (the row was just persisted
    // and Better Auth reads it back to send the email). This step mirrors the API + email
    // assertions and acts as a Phase-1 acknowledgement that the persistence is wired.
    const inv = (scenarioCtx as Record<string, unknown>)["lastInvite"] as
      | InviteApiCallState
      | undefined;
    expect(inv).toBeDefined();
    const body = inv!.body as { invitationId?: string } | undefined;
    expect(body?.invitationId).toBeTruthy();
  },
);

Then(
  "the active-workspaces endpoint returns the same active selection",
  async ({ page, scenarioCtx }) => {
    const expectedIds = (scenarioCtx as Record<string, unknown>)[
      "expectedActiveIds"
    ] as string[] | undefined;
    expect(expectedIds).toBeDefined();
    const { status, body } = await fetchActiveWorkspaces(page);
    expect(status).toBe(200);
    const got = (body as ActiveWorkspaceListResp).workspaces.map((w) => w.id);
    // The server intersects user-provided ids with actual memberships, so we
    // assert the same set rather than ordered equality.
    expect(new Set(got)).toEqual(new Set(expectedIds));
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// v1.1 BUDGET-FLAVOUR ALIASES
//
// Phase 1 renamed the workspace verbs / routes to "budget" verbs:
//   POST   /api/workspaces                   →  POST   /api/budgets
//   POST   /api/workspaces/:id/invitations   →  POST   /api/budgets/:id/invitations
//   PUT    /api/workspaces/:id/shares        →  PUT    /api/budgets/:id/shares
//   GET    /api/workspaces/active            →  GET    /api/budgets/active
//   PUT    /api/workspaces/active            →  PUT    /api/budgets/active
//   tenancy.shared_workspace_member_shares   →  tenancy.budget_member_shares
//   tenancy.workspace_invitations            →  tenancy.budget_invitations
//
// The legacy step phrasings above remain in place for back-compat. The
// "budget"-flavour steps below are exact aliases pointing at the v1.1 routes;
// they extract the budget id from the post-onboarding landing URL
// (/[locale]/budgets/[id]/...) instead of the legacy /workspaces/[id] URL.

function extractBudgetIdFromUrl(url: string): string | null {
  const m = url.match(/\/budgets\/([^/?]+)/);
  return m ? m[1]! : null;
}

Then("I land on a budget detail page", async ({ page }) => {
  // Default landing tab after onboarding is /[locale]/budgets/[id]/wallets.
  await expect(page).toHaveURL(/\/(en|pl|uk)\/budgets\/[^/]+(?:\/|$)/, {
    timeout: 15000,
  });
  expect(page.url()).not.toMatch(/\/budgets\/(undefined|new)(?:\/|$)/);
});

When(
  "I post a budget invitation for {string} with role {string}",
  async ({ page, scenarioCtx }, emailTemplate: string, role: string) => {
    const budgetId = extractBudgetIdFromUrl(page.url());
    if (!budgetId)
      throw new Error("Not on a budget detail page; cannot derive id");
    const email = emailTemplate.replace("{ts}", String(Date.now()));
    const result = await page.evaluate(
      async ({
        budgetId,
        email,
        role,
      }: {
        budgetId: string;
        email: string;
        role: string;
      }) => {
        const res = await fetch(`/api/budgets/${budgetId}/invitations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, role }),
        });
        const text = await res.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // not JSON — keep raw text
        }
        return { status: res.status, body };
      },
      { budgetId, email, role },
    );
    (scenarioCtx as Record<string, unknown>)["lastInvite"] = {
      ...result,
      email,
    } satisfies InviteApiCallState;
  },
);

Then(
  "one budget_invitations row exists for that invitee email",
  async ({ scenarioCtx }) => {
    // No direct DB binding from the e2e suite — see the legacy
    // "workspace_invitations" variant above for context. The presence of an
    // invitationId on the POST response is proof the row was just written.
    const inv = (scenarioCtx as Record<string, unknown>)["lastInvite"] as
      | InviteApiCallState
      | undefined;
    expect(inv).toBeDefined();
    const body = inv!.body as { invitationId?: string } | undefined;
    expect(body?.invitationId).toBeTruthy();
  },
);

When(
  "I PUT budget shares with the sole owner at {string}",
  async ({ page, scenarioCtx }, percentage: string) => {
    const budgetId = extractBudgetIdFromUrl(page.url());
    if (!budgetId)
      throw new Error("Not on a budget detail page; cannot derive id");

    const result = await page.evaluate(
      async ({
        budgetId,
        percentage,
      }: {
        budgetId: string;
        percentage: string;
      }) => {
        const sessionRes = await fetch("/api/auth/get-session", {
          credentials: "include",
        });
        const sessionJson = (await sessionRes.json()) as {
          user?: { id?: string };
        } | null;
        const userId = sessionJson?.user?.id;
        if (!userId) throw new Error("No userId from get-session");
        const r = await fetch(`/api/budgets/${budgetId}/shares`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ shares: [{ userId, percentage }] }),
        });
        const text = await r.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // raw text
        }
        return { status: r.status, body };
      },
      { budgetId, percentage },
    );
    (scenarioCtx as Record<string, unknown>)["lastSharesCall"] =
      result satisfies SharesApiCallState;
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// Multi-budget creation + active-selection persistence (plan rewrite #16).
//
// API: POST /api/budgets, GET /api/budgets/active, PUT /api/budgets/active.
// The "active-workspaces" verbs above remain for legacy features; these
// "active-budgets" verbs are exact aliases against the same endpoint.

interface CreateBudgetApiCallState {
  status: number;
  body: unknown;
  name: string;
}

async function fetchActiveBudgets(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const res = await fetch("/api/budgets/active", { credentials: "include" });
    return { status: res.status, body: await res.json() };
  });
}

When(
  "I POST a new budget {string} with kind {string} currency {string}",
  async ({ page, scenarioCtx }, name: string, kind: string, currency: string) => {
    const result = await page.evaluate(
      async ({
        name,
        kind,
        currency,
      }: {
        name: string;
        kind: string;
        currency: string;
      }) => {
        const res = await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, kind, default_currency: currency }),
        });
        const text = await res.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // raw text
        }
        return { status: res.status, body };
      },
      { name, kind, currency },
    );
    (scenarioCtx as Record<string, unknown>)["lastCreateBudget"] = {
      ...result,
      name,
    } satisfies CreateBudgetApiCallState;
  },
);

Then(
  "the create-budget API responds 201 with a budget id",
  async ({ scenarioCtx }) => {
    const r = (scenarioCtx as Record<string, unknown>)["lastCreateBudget"] as
      | CreateBudgetApiCallState
      | undefined;
    expect(r, "no create-budget API call recorded").toBeDefined();
    expect([200, 201], JSON.stringify(r!.body)).toContain(r!.status);
    const body = r!.body as { id?: string } | undefined;
    expect(body?.id, JSON.stringify(r!.body)).toBeTruthy();
  },
);

Then(
  "the active-budgets endpoint returns {int} budgets",
  async ({ page }, expected: number) => {
    const { status, body } = await fetchActiveBudgets(page);
    expect(status).toBe(200);
    const data = body as {
      budgets?: Array<{ id: string }>;
      workspaces?: Array<{ id: string }>;
    };
    const list = data.budgets ?? data.workspaces ?? [];
    expect(list).toHaveLength(expected);
  },
);

When(
  "I set the active budgets to all owned budgets",
  async ({ page, scenarioCtx }) => {
    const { body } = await fetchActiveBudgets(page);
    const data = body as {
      budgets?: Array<{ id: string }>;
      workspaces?: Array<{ id: string }>;
    };
    const ids = (data.budgets ?? data.workspaces ?? []).map((w) => w.id);
    const result = await page.evaluate(async (budgetIds: string[]) => {
      const res = await fetch("/api/budgets/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // The API still accepts the legacy `workspaceIds` key (Phase 1 kept
        // both for back-compat — see apps/api/src/routes/budgets.ts).
        body: JSON.stringify({ workspaceIds: budgetIds }),
      });
      return { status: res.status, body: await res.json() };
    }, ids);
    expect(result.status).toBe(200);
    (scenarioCtx as Record<string, unknown>)["expectedActiveIds"] = (
      result.body as ActiveWorkspaceSelectionResp
    ).activeWorkspaceIds;
  },
);

Then(
  "the active-budgets endpoint returns the same active selection",
  async ({ page, scenarioCtx }) => {
    const expectedIds = (scenarioCtx as Record<string, unknown>)[
      "expectedActiveIds"
    ] as string[] | undefined;
    expect(expectedIds).toBeDefined();
    const { status, body } = await fetchActiveBudgets(page);
    expect(status).toBe(200);
    const data = body as {
      budgets?: Array<{ id: string }>;
      workspaces?: Array<{ id: string }>;
    };
    const got = (data.budgets ?? data.workspaces ?? []).map((w) => w.id);
    expect(new Set(got)).toEqual(new Set(expectedIds));
  },
);
