/**
 * Sign in as UAT user; create a EUR budget + 2 categories + 2 wallets so the
 * Wallets and Reserves tabs are populated for UAT.
 */

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const EMAIL = process.env.EMAIL || "uat-1779053383257@example.com";
const PASSWORD = process.env.PASSWORD || "TestPass123!";

interface Cookies {
  header: string;
}

async function signIn(): Promise<Cookies> {
  const res = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length === 0) {
    const single = res.headers.get("set-cookie");
    if (single) setCookie.push(single);
  }
  if (setCookie.length === 0) throw new Error("no session cookie returned");
  return { header: setCookie.map((c) => c.split(";")[0]).join("; ") };
}

async function createBudget(
  cookies: Cookies,
  name: string,
  currency: string,
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${APP_URL}/api/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies.header },
    body: JSON.stringify({ name, kind: "PRIVATE", default_currency: currency }),
  });
  if (!res.ok) throw new Error(`budget failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

async function createCategory(
  cookies: Cookies,
  budgetId: string,
  name: string,
): Promise<{ id: string }> {
  const res = await fetch(`${APP_URL}/api/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookies.header,
      "X-Budget-ID": budgetId,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`category failed (${name}): ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { category: { id: string } };
  return { id: body.category.id };
}

async function createWallet(
  cookies: Cookies,
  budgetId: string,
  name: string,
  walletType: "SPENDINGS" | "RESERVE" | "CUSHION",
  currency: string,
): Promise<{ id: string }> {
  const res = await fetch(`${APP_URL}/api/wallets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookies.header,
      "X-Budget-ID": budgetId,
    },
    body: JSON.stringify({ name, walletType, currency }),
  });
  if (!res.ok) throw new Error(`wallet failed (${name}): ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

async function main() {
  console.log("[uat-provision] signing in...");
  const cookies = await signIn();

  console.log("[uat-provision] creating EUR budget...");
  const budget = await createBudget(cookies, "UAT Phase5 EUR", "EUR");
  console.log(`  budget: ${budget.id} (${budget.name})`);

  console.log("[uat-provision] creating categories...");
  const groceries = await createCategory(cookies, budget.id, "Groceries");
  const housing = await createCategory(cookies, budget.id, "Housing");
  console.log(`  groceries: ${groceries.id}`);
  console.log(`  housing:   ${housing.id}`);

  console.log("[uat-provision] creating wallets...");
  const checking = await createWallet(cookies, budget.id, "Checking", "SPENDINGS", "EUR");
  const savings = await createWallet(cookies, budget.id, "Savings", "RESERVE", "EUR");
  console.log(`  Checking (SPENDINGS, EUR): ${checking.id}`);
  console.log(`  Savings  (RESERVE,   EUR): ${savings.id}`);

  console.log("\n[uat-provision] SUMMARY");
  console.log(JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
    budgetId: budget.id,
    budgetName: budget.name,
    currency: "EUR",
    categories: { groceries: groceries.id, housing: housing.id },
    wallets: { checking: checking.id, savings: savings.id },
    walletsUrl: `${APP_URL}/budgets/${budget.id}/wallets`,
    reservesUrl: `${APP_URL}/budgets/${budget.id}/reserves`,
  }, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
