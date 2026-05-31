import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { TaskBannerPo } from "../page-objects/TaskBannerPo";
import { ReservesPo } from "../page-objects/ReservesPo";
import { WalletsPo } from "../page-objects/WalletsPo";
import { SettingsPo } from "../page-objects/SettingsPo";

const { Given, When, Then } = createBdd(test);

// -----------------------------------------------------------------------
// Seed helpers — wrap pg.Pool with the tenant-id RLS GUC so seeds satisfy
// budgeting.tasks FORCE ROW LEVEL SECURITY (mirrors common-steps.ts pattern).
// -----------------------------------------------------------------------

interface SeedPayload {
  shortfallCents?: number;
  amountCents?: number;
  currency?: string;
  ruleName?: string;
}

async function withTenantClient<T>(
  budgetId: string,
  fn: (
    client: import("pg").PoolClient,
  ) => Promise<T>,
): Promise<T> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL_APP not set — cannot seed");
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{${budgetId}}`,
      ]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function seedTask(
  budgetId: string,
  kind: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | "CUSHION_BELOW_TARGET",
  payload: SeedPayload,
): Promise<string> {
  const payloadJson: Record<string, unknown> = {};
  if (payload.shortfallCents !== undefined)
    payloadJson.shortfall_cents = payload.shortfallCents;
  if (payload.amountCents !== undefined)
    payloadJson.amount_cents = payload.amountCents;
  if (payload.currency !== undefined) payloadJson.currency = payload.currency;
  if (payload.ruleName !== undefined) payloadJson.rule_name = payload.ruleName;
  return await withTenantClient(budgetId, async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO budgeting.tasks (id, tenant_id, budget_id, kind, payload_json, status)
       VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, $3::jsonb, 'PENDING')
       RETURNING id`,
      [budgetId, kind, JSON.stringify(payloadJson)],
    );
    return res.rows[0].id;
  });
}

async function resolveAllTasks(budgetId: string): Promise<void> {
  await withTenantClient(budgetId, async (client) => {
    await client.query(
      `UPDATE budgeting.tasks SET status = 'RESOLVED', resolved_at = now()
       WHERE budget_id = $1::uuid AND status = 'PENDING'`,
      [budgetId],
    );
  });
}

async function setCushionEnabled(
  budgetId: string,
  enabled: boolean,
  targetMonths?: number,
): Promise<void> {
  await withTenantClient(budgetId, async (client) => {
    if (targetMonths !== undefined) {
      await client.query(
        `UPDATE tenancy.budgets SET cushion_enabled = $1, cushion_target_months = $2 WHERE id = $3::uuid`,
        [enabled, targetMonths, budgetId],
      );
    } else {
      await client.query(
        `UPDATE tenancy.budgets SET cushion_enabled = $1 WHERE id = $2::uuid`,
        [enabled, budgetId],
      );
    }
  });
}

// -----------------------------------------------------------------------
// Given — task seeding with payload
// -----------------------------------------------------------------------

Given(
  /^a "(RESERVE_TOPUP|CUSHION_BELOW_TARGET)" task is seeded for "(.+?)" with shortfall (\d+) cents in "(.+?)"$/,
  async (
    { freshUser },
    kind: "RESERVE_TOPUP" | "CUSHION_BELOW_TARGET",
    budgetName: string,
    shortfall: string,
    currency: string,
  ) => {
    if (freshUser.budgetName !== budgetName) {
      throw new Error(`Unknown budget '${budgetName}'`);
    }
    const id = await seedTask(freshUser.budgetId, kind, {
      shortfallCents: Number(shortfall),
      currency,
    });
    // Stash the most recent seeded task id on a shared symbol so the
    // resolve-server-side step can target it precisely.
    (freshUser as unknown as { _lastTaskId?: string })._lastTaskId = id;
  },
);

Given(
  /^a "CONFIRM_DRAFT" task is seeded for "(.+?)" with rule "(.+?)" amount (\d+) cents in "(.+?)"$/,
  async (
    { freshUser },
    budgetName: string,
    ruleName: string,
    amount: string,
    currency: string,
  ) => {
    if (freshUser.budgetName !== budgetName) {
      throw new Error(`Unknown budget '${budgetName}'`);
    }
    const id = await seedTask(freshUser.budgetId, "CONFIRM_DRAFT", {
      ruleName,
      amountCents: Number(amount),
      currency,
    });
    (freshUser as unknown as { _lastTaskId?: string })._lastTaskId = id;
  },
);

Given("the seeded task is resolved server-side", async ({ freshUser }) => {
  await resolveAllTasks(freshUser.budgetId);
});

Given(
  /^a second emit attempt is made for the same shortfall$/,
  async ({ freshUser }) => {
    // The dedup semantic lives in the application repository, not the
    // raw seed path. This step is currently a no-op; the scenario is
    // tagged @skip-phase-07-debt until the repository-level dedup helper
    // is exposed to E2E (tracked in 07-10 deferred-items).
    void freshUser;
  },
);

Given(
  /^the budget "(.+?)" has cushion enabled with target (\d+) months$/,
  async ({ freshUser }, budgetName: string, months: string) => {
    if (freshUser.budgetName !== budgetName) {
      throw new Error(`Unknown budget '${budgetName}'`);
    }
    await setCushionEnabled(freshUser.budgetId, true, Number(months));
  },
);

// -----------------------------------------------------------------------
// When — Phase 7 banner interactions + per-kind navigation steps
// -----------------------------------------------------------------------

When("I click the task action button", async ({ page }) => {
  const banner = new TaskBannerPo(page);
  await banner.rowActionButton(0).click();
});

When(
  /^I open the BDP settings tab for "(.+?)"$/,
  async ({ page, freshUser }, name: string) => {
    if (freshUser.budgetName !== name) throw new Error(`Unknown budget '${name}'`);
    await page.goto(`/en/budgets/${freshUser.budgetId}/settings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

When("I open the cushion section", async ({ page }) => {
  const settings = new SettingsPo(page);
  await settings.openCushionSection();
});

When(
  /^I change the cushion target months to (\d+)$/,
  async ({ page }, months: string) => {
    const settings = new SettingsPo(page);
    await settings.changeCushionTargetMonths(Number(months));
  },
);

// -----------------------------------------------------------------------
// Then — Phase 7 banner / navigation / settings assertions
// -----------------------------------------------------------------------

Then(/^I see a task with title "(.+?)"$/, async ({ page }, title: string) => {
  const banner = new TaskBannerPo(page);
  await expect(banner.rowByTitle(title)).toBeVisible();
});

Then(
  /^I see a task with title containing "(.+?)" and "(.+?)"$/,
  async ({ page }, a: string, b: string) => {
    const banner = new TaskBannerPo(page);
    // Each row contains both substrings; match a single row that contains
    // BOTH (avoids `strict mode violation` if other UI labels reuse one).
    const row = banner
      .banner()
      .getByRole("listitem")
      .filter({ hasText: a })
      .filter({ hasText: b });
    await expect(row).toBeVisible();
  },
);

Then(
  /^the action button label is "(.+?)"$/,
  async ({ page }, label: string) => {
    const banner = new TaskBannerPo(page);
    await banner.assertActionLabel(label);
  },
);

Then("I am navigated to the reserves tab", async ({ page }) => {
  await page.waitForURL(/\/budgets\/[^/]+\/reserves/, { timeout: 5000 });
});

Then("I am navigated to the wallets tab", async ({ page }) => {
  await page.waitForURL(/\/budgets\/[^/]+\/wallets/, { timeout: 5000 });
});

Then(
  /^within (\d+) seconds the task banner is not present in the DOM$/,
  async ({ page }, secs: string) => {
    const banner = new TaskBannerPo(page);
    await banner.waitForGone(Number(secs) * 1000);
  },
);

Then(
  /^within (\d+) seconds the cushion target months input shows (\d+)$/,
  async ({ page }, secs: string, value: string) => {
    // playwright-bdd coerces `\d+` capture groups to numbers despite the TS
    // string annotation; toHaveValue requires string|RegExp so coerce back.
    const settings = new SettingsPo(page);
    await expect(settings.cushionTargetMonthsInput()).toHaveValue(String(value), {
      timeout: Number(secs) * 1000,
    });
  },
);
