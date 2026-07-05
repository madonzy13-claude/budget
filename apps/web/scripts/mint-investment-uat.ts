/**
 * mint-investment-uat.ts — hand a logged-in UAT account showcasing the r33 smart
 * Investments category. Run from apps/web with PLAYWRIGHT_BASE_URL set.
 */
import {
  signUpViaHttp,
  parseSetCookieToPlaywright,
  createBudgetViaHttp,
  createCategoryViaHttp,
} from "../e2e/fixtures/fresh-user-per-scenario";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "https://budget-dev.madonzy.com";
const email = `invest-uat-${Date.now()}@test.local`;
const password = "testpassword123!";

async function api(
  path: string,
  cookie: string,
  budgetId: string,
  method: string,
  body?: unknown,
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie,
      Origin: base,
      "X-Budget-ID": budgetId,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const { setCookieHeaders } = await signUpViaHttp(
  base,
  email,
  password,
  "Investments UAT",
);
const cookies = setCookieHeaders
  .map((l) => parseSetCookieToPlaywright(l, base))
  .filter((c): c is NonNullable<typeof c> => c !== null);
const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

const budgetId = await createBudgetViaHttp(base, cookie, "Investments Demo");

// Enable investments feature.
await api(`/api/budgets/${budgetId}`, cookie, budgetId, "PATCH", {
  investments_enabled: true,
});

// Two normal categories with planned limits (so the smart limit has something
// to subtract): Groceries 800 + Rent 1500 = 2300 planned.
for (const [name, amount] of [
  ["Groceries", "80000"],
  ["Rent", "150000"],
] as const) {
  const catId = await createCategoryViaHttp(base, cookie, budgetId, name);
  const month = new Date().toISOString().slice(0, 7);
  await api(
    `/api/budgets/${budgetId}/categories/${catId}/limits`,
    cookie,
    budgetId,
    "POST",
    { normalAmount: amount, cushionAmount: "0", effectiveFrom: `${month}-01` },
  );
}

// A monthly income of 4000 → smart limit = 4000 − 2300 = 1700.
await api(`/api/budgets/${budgetId}/incomes`, cookie, budgetId, "POST", {
  name: "Salary",
  amount: "4000",
  currency: "USD",
  cadence: "MONTHLY",
  cadence_anchor: 1,
});

// Create the smart Investments category (defaults to smart mode).
await api(
  `/api/budgets/${budgetId}/investment-category`,
  cookie,
  budgetId,
  "POST",
  { name: "Investments" },
);

console.log(
  JSON.stringify(
    {
      email,
      password,
      budgetId,
      url: `${base}/en/budgets/${budgetId}`,
      spendings: `${base}/en/budgets/${budgetId}/spendings`,
    },
    null,
    2,
  ),
);
