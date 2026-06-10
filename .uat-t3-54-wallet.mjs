// UAT-PH5-T3-54 wallet-delta verification.
// Continues from state established by .uat-t3-54-seed.mjs.
// State after seed: H.expected=200, H.actual=200, G.expected=2500, G.actual=1500.

const APP_URL = "http://localhost:3000";
const EMAIL = "uat-1779212895217@example.com";
const PASSWORD = "TestPass123!";
const BUDGET_ID = "96bbcd9a-1d64-4e18-b277-a23004e8fb24";
const GROCERIES = "2e6a41c9-f8aa-4b3b-b46b-ea047f5cb3e9";
const HOUSING = "5c933da1-7e66-4435-b9b9-9a3a8896e2bb";
const SAVINGS = "196a02fd-c21b-49ae-b946-c8aa1323dc2d";

async function signIn() {
  const res = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  return sc.map((c) => c.split(";")[0]).join("; ");
}
async function call(cookie, method, path, body) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie, "X-Budget-ID": BUDGET_ID },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok)
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const cookie = await signIn();

// Categories in DB: G sort_index=0 (top), H sort_index=1 (bottom).
// Deduct = bottom→top means H takes the hit first.
// Refill = top→bottom means G eats first.
console.log("[step 1] drop wallet to 5 EUR (H is bottom — takes hit first)");
await call(cookie, "PUT", `/api/wallets/${SAVINGS}/balance`, {
  amount: "5.00",
  currency: "EUR",
});
await new Promise((r) => setTimeout(r, 300));

let s = await call(cookie, "GET", `/api/budgets/${BUDGET_ID}/reserves`);
let H = s.rows.find((r) => r.categoryId === HOUSING);
let G = s.rows.find((r) => r.categoryId === GROCERIES);
console.log(`  H.actual=${H.walletShareAmountCents} (expected 0)`);
console.log(`  G.actual=${G.walletShareAmountCents} (expected 500)`);

const phase1Ok =
  H.walletShareAmountCents === "0" && G.walletShareAmountCents === "500";

console.log("[step 2] bump wallet back to 17 EUR (G is top — refills first)");
await call(cookie, "PUT", `/api/wallets/${SAVINGS}/balance`, {
  amount: "17.00",
  currency: "EUR",
});
await new Promise((r) => setTimeout(r, 300));

s = await call(cookie, "GET", `/api/budgets/${BUDGET_ID}/reserves`);
H = s.rows.find((r) => r.categoryId === HOUSING);
G = s.rows.find((r) => r.categoryId === GROCERIES);
console.log(`  H.actual=${H.walletShareAmountCents} (expected 0)`);
console.log(`  G.actual=${G.walletShareAmountCents} (expected 1700)`);

const phase2Ok =
  H.walletShareAmountCents === "0" && G.walletShareAmountCents === "1700";

if (phase1Ok && phase2Ok) {
  console.log("\n✅ PASS — wallet deduct/refill behaves correctly");
  process.exit(0);
} else {
  console.log("\n❌ FAIL");
  process.exit(1);
}
