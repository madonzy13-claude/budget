import { createBdd } from "playwright-bdd";
import {
  test,
  signUpViaHttp,
  parseSetCookieToPlaywright,
  type ParsedCookie,
} from "../fixtures/fresh-user-per-scenario";
import { TopNavPo } from "../page-objects/TopNavPo";
import { HomePo } from "../page-objects/HomePo";
import { BdpPo, type BdpTabSlug } from "../page-objects/BdpPo";
import { SwitcherPo } from "../page-objects/SwitcherPo";
import { TaskBannerPo } from "../page-objects/TaskBannerPo";

const { Given, When, Then } = createBdd(test);

Given("I am signed in as a fresh user", async ({ freshUser }) => {
  // Fixture has already created the user via Better Auth signUpEmail and seeded
  // the session cookie into the browser context. No UI sign-in step needed.
  void freshUser;
});

Given("I am a signed-in user with no budgets", async ({ context, baseURL }) => {
  const baseUrl =
    baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const email = `phase3-e2e-empty-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@test.local`;
  const password = "Test1234!Phase3";
  const { setCookieHeaders } = await signUpViaHttp(
    baseUrl,
    email,
    password,
    "Empty User",
  );
  const cookies = setCookieHeaders
    .map((l) => parseSetCookieToPlaywright(l, baseUrl))
    .filter((c): c is ParsedCookie => c !== null);
  if (cookies.length === 0) {
    throw new Error("empty-user signup had no Set-Cookie headers");
  }
  await context.addCookies(cookies);
});

Given("I am on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
});

Given(
  "a {string} task is seeded for {string}",
  async ({ freshUser }, kind: string, budgetName: string) => {
    if (freshUser.budgetName !== budgetName) {
      throw new Error(`Unknown budget '${budgetName}'`);
    }
    const { Pool } = await import("pg");
    const dbUrl =
      process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
    if (!dbUrl) throw new Error("DATABASE_URL_APP not set — cannot seed task");
    const pool = new Pool({ connectionString: dbUrl });
    try {
      // budgeting.tasks has FORCE ROW LEVEL SECURITY scoped by
      // `app.tenant_ids` (plural, postgres array literal). Without the GUC,
      // INSERT fails the policy check. Wrap in a tx and set the GUC so the
      // test-only seed mirrors the production withTenantTx contract.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
          `{${freshUser.budgetId}}`,
        ]);
        await client.query(
          `INSERT INTO budgeting.tasks (id, tenant_id, budget_id, kind, payload_json, status) VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, '{}'::jsonb, 'PENDING')`,
          [freshUser.budgetId, kind],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  },
);

When("I open the home page", async ({ page }) => {
  await page.goto("/en");
  // Wait for hydration so subsequent click handlers (router.push, onClick) fire.
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

When(
  "I open the BDP for {string}",
  async ({ page, freshUser }, name: string) => {
    if (freshUser.budgetName !== name) {
      throw new Error(
        `Unknown budget '${name}' — fixture seeded '${freshUser.budgetName}'`,
      );
    }
    await page.goto(`/en/budgets/${freshUser.budgetId}`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

When(
  "I open the BDP wallets tab for {string}",
  async ({ page, freshUser }, name: string) => {
    if (freshUser.budgetName !== name)
      throw new Error(`Unknown budget '${name}'`);
    await page.goto(`/en/budgets/${freshUser.budgetId}/wallets`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

When(
  "I open the BDP spendings tab for {string}",
  async ({ page, freshUser }, name: string) => {
    if (freshUser.budgetName !== name)
      throw new Error(`Unknown budget '${name}'`);
    await page.goto(`/en/budgets/${freshUser.budgetId}/spendings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

When("I open the budget switcher", async ({ page }) => {
  const nav = new TopNavPo(page);
  await nav.switcherTrigger().click();
});

When("I click the row for {string}", async ({ page }, name: string) => {
  const sw = new SwitcherPo(page);
  await sw.budgetRow(name).click();
});

When(
  'I click the "Create budget" row in the switcher dropdown',
  async ({ page }) => {
    // UAT-PH5-T2-03: the header "+" was removed; the bottom row of the
    // switcher dropdown now drives /budgets/new.
    await page
      .getByRole("menuitem", {
        name: /create budget|utwórz budżet|створити бюджет/i,
      })
      .click();
  },
);

When('I click the "+" new-budget button', async ({ page }) => {
  const nav = new TopNavPo(page);
  await nav.newBudgetButton().click();
});

When("I click the {string} tab pill", async ({ page }, slug: string) => {
  const bdp = new BdpPo(page);
  const before = page.url();
  await bdp.pill(slug.toLowerCase() as BdpTabSlug).click();
  // Wait for the SPA route hop so subsequent Browser-Back / URL-end assertions
  // observe the new history entry.
  await page
    .waitForURL((url) => url.toString() !== before, { timeout: 5000 })
    .catch(() => {});
});

When("I press the browser Back button", async ({ page }) => {
  await page.goBack();
});

When("I click the task banner", async ({ page }) => {
  const banner = new TaskBannerPo(page);
  await banner.trigger().click();
});

When("I click the card for {string}", async ({ page }, name: string) => {
  const home = new HomePo(page);
  const before = page.url();
  await home.card(name).click();
  await page
    .waitForURL((url) => url.toString() !== before, { timeout: 5000 })
    .catch(() => {});
});

Then("I see the {string} budget section", async ({ page }, label: string) => {
  const sw = new SwitcherPo(page);
  if (label.toLowerCase() === "personal")
    await sw.personalSection().waitFor({ state: "visible" });
  else if (label.toLowerCase() === "shared")
    await sw.sharedSection().waitFor({ state: "visible" });
});

Then(
  "I do not see the {string} budget section",
  async ({ page }, label: string) => {
    const sw = new SwitcherPo(page);
    const loc =
      label.toLowerCase() === "personal"
        ? sw.personalSection()
        : sw.sharedSection();
    const count = await loc.count();
    if (count !== 0) {
      throw new Error(
        `Expected ${label} section to be absent, but found ${count} elements`,
      );
    }
  },
);

Then("the URL contains {string}", async ({ page }, fragment: string) => {
  // Wait for client-side navigation (Next.js router.push) to settle. Without
  // this wait, the URL check fires synchronously and misses the SPA hop that
  // hasn't happened yet.
  await page
    .waitForURL((url) => url.toString().includes(fragment), { timeout: 5000 })
    .catch(() => {});
  const url = page.url();
  if (!url.includes(fragment)) {
    throw new Error(`URL ${url} does not contain ${fragment}`);
  }
});

Then("the URL ends with {string}", async ({ page }, suffix: string) => {
  await page
    .waitForURL((url) => url.toString().endsWith(suffix), { timeout: 5000 })
    .catch(() => {});
  const url = page.url();
  if (!url.endsWith(suffix)) {
    throw new Error(`URL ${url} does not end with ${suffix}`);
  }
});

Then(
  "the URL contains {string} followed by the budget id and {string}",
  async ({ page, freshUser }, prefix: string, suffix: string) => {
    const expected = `${prefix}${freshUser.budgetId}${suffix}`;
    await page
      .waitForURL((url) => url.toString().includes(expected), { timeout: 5000 })
      .catch(() => {});
    const url = page.url();
    if (!url.includes(expected)) {
      throw new Error(`URL ${url} did not contain ${expected}`);
    }
  },
);

Then(
  "the {string} tab pill has the active state",
  async ({ page }, slug: string) => {
    const bdp = new BdpPo(page);
    const pill = bdp.pill(slug.toLowerCase() as BdpTabSlug);
    const ariaCurrent = await pill.getAttribute("aria-current");
    if (ariaCurrent !== "page") {
      throw new Error(
        `Expected ${slug} pill to have aria-current="page", got ${ariaCurrent}`,
      );
    }
  },
);

Then(
  "the {string} tab pill has the active state on first paint",
  async ({ page }, slug: string) => {
    const bdp = new BdpPo(page);
    const pill = bdp.pill(slug.toLowerCase() as BdpTabSlug);
    await pill.waitFor({ state: "visible" });
    const ariaCurrent = await pill.getAttribute("aria-current");
    if (ariaCurrent !== "page") {
      throw new Error(
        `Expected ${slug} pill active on first paint, got aria-current=${ariaCurrent}`,
      );
    }
  },
);

Then(
  "the inactive pill {string} hides its label",
  async ({ page }, slug: string) => {
    const bdp = new BdpPo(page);
    const pill = bdp.pill(slug.toLowerCase() as BdpTabSlug);
    const label = pill.locator("span").first();
    const visible = await label.isVisible();
    if (visible) {
      throw new Error(
        `Expected inactive ${slug} pill label to be hidden on phone viewport`,
      );
    }
  },
);

Then("the task banner is not present in the DOM", async ({ page }) => {
  const banner = new TaskBannerPo(page);
  const count = await banner.banner().count();
  if (count !== 0) {
    throw new Error(`Expected no task banner, found ${count}`);
  }
});

Then("the task banner is expanded", async ({ page }) => {
  const banner = new TaskBannerPo(page);
  const expanded = await banner.trigger().getAttribute("aria-expanded");
  if (expanded !== "true") {
    throw new Error(`Expected aria-expanded=true, got ${expanded}`);
  }
});

Then("the expanded list shows {int} task row", async ({ page }, n: number) => {
  const banner = new TaskBannerPo(page);
  const rows = await banner.banner().getByRole("listitem").count();
  if (rows !== n) {
    throw new Error(`Expected ${n} task rows, found ${rows}`);
  }
});

Then("the task row's primary action button is disabled", async ({ page }) => {
  const banner = new TaskBannerPo(page);
  const btn = banner.taskRow(0).getByRole("button");
  const disabled = await btn.isDisabled();
  if (!disabled) {
    throw new Error("Expected primary action button to be disabled");
  }
});

Then("the task banner displays {string}", async ({ page }, text: string) => {
  await page.getByText(text).waitFor({ state: "visible" });
});

Then("I see a budget card titled {string}", async ({ page }, name: string) => {
  await page
    .getByRole("heading", { name })
    .first()
    .waitFor({ state: "visible" });
});

Then("I see the {string} placeholder chart", async ({ page }, text: string) => {
  await page.getByText(text).waitFor({ state: "visible" });
});

Then("I see the {string} CTA", async ({ page }, text: string) => {
  await page.getByRole("link", { name: text }).waitFor({ state: "visible" });
});

Then(
  "the switcher trigger displays the active budget name",
  async ({ page, freshUser }) => {
    const nav = new TopNavPo(page);
    const txt = await nav.switcherTrigger().textContent();
    if (!txt?.includes(freshUser.budgetName)) {
      throw new Error(
        `Trigger '${txt}' did not include '${freshUser.budgetName}'`,
      );
    }
  },
);
