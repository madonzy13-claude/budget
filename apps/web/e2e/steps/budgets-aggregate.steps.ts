import { createBdd } from "playwright-bdd";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/fresh-user-per-scenario";
import { fetchWith429Retry } from "../fixtures/fetch-with-429-retry";

const { Given, When, Then } = createBdd(test);

/**
 * budgets-aggregate.steps.ts — Task 17 E2E for the all-budgets aggregate
 * overview (Tasks 1-16). Seeds via the REAL HTTP API (same contracts the
 * fixture's own createBudgetViaHttp / createCategoryViaHttp use), never via a
 * DB bypass.
 *
 * Per-scenario state (which budget name maps to which id, and the
 * pre-exclude hero reading) is keyed off the `freshUser` object identity in a
 * WeakMap — freshUser is a fresh fixture instance per scenario, so this never
 * leaks across tests.
 */
const budgetIdByName = new WeakMap<object, Map<string, string>>();
const heroBaseline = new WeakMap<object, number>();

function registryFor(freshUser: object): Map<string, string> {
  let m = budgetIdByName.get(freshUser);
  if (!m) {
    m = new Map();
    budgetIdByName.set(freshUser, m);
  }
  return m;
}

/** Mirrors fixture's createBudgetViaHttp but lets the caller pick a currency
 * (the shared helper hardcodes USD — this scenario needs a EUR budget too). */
async function createBudgetWithCurrency(
  baseUrl: string,
  cookieHeader: string,
  name: string,
  currency: string,
): Promise<string> {
  const res = await fetchWith429Retry(() =>
    fetch(`${baseUrl}/api/budgets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
        Origin: baseUrl,
      },
      body: JSON.stringify({
        name,
        kind: "PRIVATE",
        default_currency: currency,
      }),
    }),
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(
      `createBudget(${currency}) failed (${res.status}): ${body}`,
    );
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** POST /api/wallets — tenant selected via X-Budget-ID (wallets is mounted at
 * the API root, not nested under /budgets/:id — see apps/api/src/app.ts). */
async function createWalletViaHttp(
  baseUrl: string,
  cookieHeader: string,
  budgetId: string,
  currency: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/wallets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      Origin: baseUrl,
      "X-Budget-ID": budgetId,
    },
    body: JSON.stringify({
      name: "E2E Cash",
      walletType: "SPENDINGS",
      currency,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`createWallet failed (${res.status}): ${body}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** PUT /api/wallets/:id/balance — amount is a DECIMAL major-unit string
 * (setBalanceSchema), not cents. */
async function setWalletBalanceViaHttp(
  baseUrl: string,
  cookieHeader: string,
  budgetId: string,
  walletId: string,
  amountDecimal: string,
  currency: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/wallets/${walletId}/balance`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      Origin: baseUrl,
      "X-Budget-ID": budgetId,
    },
    body: JSON.stringify({ amount: amountDecimal, currency }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`setWalletBalance failed (${res.status}): ${body}`);
  }
}

/**
 * Reveal + read the aggregate hero's numeric value.
 *
 * The hero is a SlotAmount (privacy mask, r41) — real digits never sit in the
 * DOM text while hidden. `aria-label` is `revealed ? value : "hidden"` and is
 * driven straight off the live `value` prop (not the scrambling `display`
 * state), so once revealed it always reflects the CURRENT figure even while
 * the visual scramble animation is still mid-flight. Idempotent: only clicks
 * to reveal once per page (all SlotAmounts share one reveal provider).
 */
async function readHeroMajorUnits(page: Page): Promise<number> {
  const heroSlot = page
    .getByTestId("aggregate-hero")
    .getByTestId("slot-amount");
  await heroSlot.waitFor({ state: "visible", timeout: 10000 });
  if ((await heroSlot.getAttribute("data-revealed")) !== "true") {
    await heroSlot.click();
  }
  await expect(heroSlot).toHaveAttribute("data-revealed", "true", {
    timeout: 5000,
  });
  const label = await heroSlot.getAttribute("aria-label");
  const digits = (label ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

Given(
  /^I have a budget "(.+?)" in "(.+?)" with a wallet balance of (\d+) cents$/,
  async ({ freshUser }, name: string, currency: string, centsStr: string) => {
    const registry = registryFor(freshUser);
    let budgetId = registry.get(name);
    if (!budgetId) {
      // The fixture already created ONE budget (freshUser.budgetId, USD) — reuse
      // it for the first aggregate budget a scenario names instead of adding a
      // redundant extra one. This is what keeps the single-budget scenario
      // genuinely single-budget.
      budgetId =
        registry.size === 0 && currency === "USD"
          ? freshUser.budgetId
          : await createBudgetWithCurrency(
              freshUser.baseUrl,
              freshUser.cookieHeader,
              name,
              currency,
            );
      registry.set(name, budgetId);
    }
    const walletId = await createWalletViaHttp(
      freshUser.baseUrl,
      freshUser.cookieHeader,
      budgetId,
      currency,
    );
    const amountDecimal = (parseInt(centsStr, 10) / 100).toFixed(2);
    await setWalletBalanceViaHttp(
      freshUser.baseUrl,
      freshUser.cookieHeader,
      budgetId,
      walletId,
      amountDecimal,
      currency,
    );
  },
);

/**
 * Warm the FX cache for the pairs these scenarios convert between.
 *
 * FrankfurterFxProvider is cache-then-live: a MISS goes out to
 * api.frankfurter.dev over the network, with no timeout of its own. A CI
 * database is fresh, so every pair missed and the aggregate endpoint sat on a
 * third-party API — the run of 260814 spent longer than the page's 10s wait
 * and failed all four attempts, having passed everywhere the cache was warm.
 *
 * Seeding the exact date the read uses (UTC today) makes step 3 of that
 * algorithm hit, so the conversion never leaves the box. The rates are
 * arbitrary but must be > 1 so "combined net worth is greater than the USD
 * budget alone" stays true for the right reason.
 */
async function seedFxRates(): Promise<void> {
  const { Pool } = await import("pg");
  // fx_rates is the WORKER's table — app_role has no INSERT on it, and should
  // not: production writes it from the daily fetch job. Seed as the role that
  // owns it rather than widening a grant for a test.
  const dbUrl =
    process.env.DATABASE_URL_WORKER?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL_WORKER not set — cannot seed FX");
  const pool = new Pool({ connectionString: dbUrl });
  // Yesterday too: a run that crosses midnight UTC would otherwise miss.
  const days = [0, 1].map((back) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10),
  );
  const pairs: [string, string, string][] = [
    ["EUR", "USD", "1.08"],
    ["USD", "EUR", "0.92"],
    ["PLN", "USD", "0.25"],
    ["USD", "PLN", "4.00"],
    ["EUR", "PLN", "4.32"],
    ["PLN", "EUR", "0.23"],
  ];
  try {
    for (const day of days)
      for (const [base, quote, rate] of pairs) {
        await pool.query(
          `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider, fetched_at)
           VALUES ($1, $2, $3::date, $4, 'e2e-seed', now())
           ON CONFLICT DO NOTHING`,
          [base, quote, day, rate],
        );
      }
  } finally {
    await pool.end();
  }
}

Given("the FX cache is warm", async () => {
  await seedFxRates();
});

When("I open the all-budgets view", async ({ page }) => {
  await page.goto("/en/?list=1");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  await page
    .getByTestId("aggregate-hero")
    .waitFor({ state: "visible", timeout: 10000 });
});

Then(
  /^the aggregate hero shows a combined net worth greater than (\d+) minor units$/,
  async ({ page, freshUser }, minorUnitsStr: string) => {
    const thresholdMajor = Math.floor(parseInt(minorUnitsStr, 10) / 100);
    let lastReading = 0;
    await expect
      .poll(
        async () => {
          lastReading = await readHeroMajorUnits(page);
          return lastReading;
        },
        { timeout: 10000 },
      )
      .toBeGreaterThan(thresholdMajor);
    heroBaseline.set(freshUser, lastReading);
  },
);

When(
  /^I exclude the "(.+?)" budget from the aggregate$/,
  async ({ page, freshUser }, name: string) => {
    const budgetId = registryFor(freshUser).get(name);
    if (!budgetId) throw new Error(`Unknown budget '${name}' — not seeded`);
    // Inclusion is a per-budget self-setting in Settings → General (the
    // aggregate page itself no longer has inline toggles). Turn the include
    // switch OFF for this budget.
    await page.goto(`/en/budgets/${budgetId}/settings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    const toggle = page.getByTestId("settings-aggregation-toggle");
    await toggle.waitFor({ state: "visible", timeout: 10000 });
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-checked", "false", {
      timeout: 5000,
    });
  },
);

Then("the aggregate hero decreases", async ({ page, freshUser }) => {
  const baseline = heroBaseline.get(freshUser);
  if (baseline === undefined) {
    throw new Error(
      "no baseline hero reading recorded — the 'combined net worth' step must run first",
    );
  }
  await expect
    .poll(async () => readHeroMajorUnits(page), { timeout: 10000 })
    .toBeLessThan(baseline);
});

When(
  /^I open the general settings for "(.+?)"$/,
  async ({ page, freshUser }, name: string) => {
    const budgetId = registryFor(freshUser).get(name) ?? freshUser.budgetId;
    await page.goto(`/en/budgets/${budgetId}/settings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

When(
  /^I set my ownership share of the "(.+?)" budget to (\d+) percent$/,
  async ({ page, freshUser }, name: string, pctStr: string) => {
    const budgetId = registryFor(freshUser).get(name) ?? freshUser.budgetId;
    await page.goto(`/en/budgets/${budgetId}/settings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    // Budget-Identity (General) accordion is open by default, so the aggregation
    // toggle + share field render without expanding anything. Include defaults
    // ON for a new budget → the share field is visible; ensure it before typing.
    const toggle = page.getByTestId("settings-aggregation-toggle");
    await toggle.waitFor({ state: "visible", timeout: 10000 });
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
    }
    // The share is an InlineEditCell, not a plain input: the resting cell renders
    // "100%" and only swaps in an <input> once tapped. Tap it, type the bare
    // number, Enter commits (→ the self-write PUT { included, share_pct }).
    const share = page.getByTestId("settings-aggregation-share");
    await share.waitFor({ state: "visible", timeout: 10000 });
    await share.click();
    const editor = page
      .getByTestId("settings-aggregation-share-editor")
      .locator("input");
    await editor.waitFor({ state: "visible", timeout: 5000 });
    await editor.fill(String(pctStr)); // bdd coerces \d+ to a number; fill needs a string
    await editor.press("Enter");
    // The editor unmounts when the PUT settles and the cell shows the new value.
    await expect(share).toContainText(`${pctStr}%`, { timeout: 10000 });
  },
);

Then("the include-in-aggregation toggle is not visible", async ({ page }) => {
  const count = await page.getByTestId("settings-aggregation-toggle").count();
  if (count !== 0) {
    throw new Error(
      `Expected settings-aggregation-toggle to be absent, found ${count}`,
    );
  }
});
