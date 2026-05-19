// UAT-PH5-T3-54 architecture-pivot verification:
//   actual stored per category; no auto-redistribution on read.
//   POST /reserves/:id/adjust takes target expectedCents (not delta).
//
// Scenario (user's spec):
//   Wallet Savings = 17 EUR (1700c).
//   Adjust Housing → expected = 2 EUR (target).
//   Adjust Groceries → expected = 9 EUR.
//   Bump Groceries → expected = 25 EUR (deficit; should NOT touch H).
// Expected end state:
//   Housing  reserveBalanceCents=200,  walletShareAmountCents=200,
//   Groceries reserveBalanceCents=2500, walletShareAmountCents=1500,
//   totals.mismatchCents = -1000.

const APP_URL = "http://localhost:3000";
const EMAIL = process.env.UAT_EMAIL ?? "uat-1779212895217@example.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "TestPass123!";
const BUDGET_ID = process.env.UAT_BUDGET_ID ?? "96bbcd9a-1d64-4e18-b277-a23004e8fb24";
const GROCERIES = process.env.UAT_GROCERIES ?? "2e6a41c9-f8aa-4b3b-b46b-ea047f5cb3e9";
const HOUSING = process.env.UAT_HOUSING ?? "5c933da1-7e66-4435-b9b9-9a3a8896e2bb";
const SAVINGS = process.env.UAT_SAVINGS ?? "196a02fd-c21b-49ae-b946-c8aa1323dc2d";

async function signIn() {
  const res = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in: ${res.status} ${await res.text()}`);
  const sc = res.headers.getSetCookie?.() ?? [];
  return sc.map((c) => c.split(";")[0]).join("; ");
}

async function call(cookie, method, path, body) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie,
      "X-Budget-ID": BUDGET_ID,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok)
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const cookie = await signIn();

console.log("[seed] set Savings wallet balance = 17 EUR");
await call(cookie, "PUT", `/api/wallets/${SAVINGS}/balance`, {
  amount: "17.00",
  currency: "EUR",
});
await new Promise((r) => setTimeout(r, 200));

console.log("[seed] adjust Housing → expectedCents=200");
await call(cookie, "POST", `/api/budgets/${BUDGET_ID}/reserves/${HOUSING}/adjust`, {
  expectedCents: 200,
});
await new Promise((r) => setTimeout(r, 200));

console.log("[seed] adjust Groceries → expectedCents=900");
await call(cookie, "POST", `/api/budgets/${BUDGET_ID}/reserves/${GROCERIES}/adjust`, {
  expectedCents: 900,
});
await new Promise((r) => setTimeout(r, 200));

console.log("[seed] bump Groceries → expectedCents=2500 (deficit; must NOT touch H)");
await call(cookie, "POST", `/api/budgets/${BUDGET_ID}/reserves/${GROCERIES}/adjust`, {
  expectedCents: 2500,
});
await new Promise((r) => setTimeout(r, 300));

console.log("\n[verify] GET /reserves");
const summary = await call(cookie, "GET", `/api/budgets/${BUDGET_ID}/reserves`);
console.log(JSON.stringify(summary, null, 2));

const G = summary.rows.find((r) => r.categoryId === GROCERIES);
const H = summary.rows.find((r) => r.categoryId === HOUSING);

const passes = [];
const fails = [];
function check(name, expected, actual) {
  if (String(expected) === String(actual))
    passes.push(`✓ ${name}: ${actual}`);
  else fails.push(`✗ ${name}: expected ${expected}, got ${actual}`);
}
check("Housing expected (reserveBalanceCents)", "200", H?.reserveBalanceCents);
check("Housing actual (walletShareAmountCents)", "200", H?.walletShareAmountCents);
check("Groceries expected", "2500", G?.reserveBalanceCents);
check("Groceries actual", "1500", G?.walletShareAmountCents);
check("totalCategoryReservesCents", "2700", summary.totals.totalCategoryReservesCents);
check("totalReserveWalletAmountCents", "1700", summary.totals.totalReserveWalletAmountCents);
check("mismatchCents", "-1000", summary.totals.mismatchCents);

console.log("\n[results]");
passes.forEach((p) => console.log(p));
fails.forEach((f) => console.log(f));
console.log(
  `\n${fails.length === 0 ? "✅ PASS" : "❌ FAIL"} (${passes.length}/${passes.length + fails.length})`,
);
process.exit(fails.length === 0 ? 0 : 1);
