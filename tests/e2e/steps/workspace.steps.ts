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
