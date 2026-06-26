/**
 * provision-uat-investments.ts — one-off: create a STABLE UAT account on the
 * live stack, enable investments, and seed a varied holdings set so the owner
 * can exercise the Phase-9 UAT items (drag, collapse, type-first, visual) right
 * after login. Prints the credentials. Run:
 *
 *   infisical run --env=dev -- bun run scripts/provision-uat-investments.ts
 *
 * Uses the e2e fixture's signup+verify (mailpit) + budget-create helpers, then a
 * direct RLS-scoped insert for the seed rows (no price-provider dependency).
 */
import { Pool } from "pg";
import {
  signUpViaHttp,
  createBudgetViaHttp,
  parseSetCookieToPlaywright,
} from "../apps/web/e2e/fixtures/fresh-user-per-scenario";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://budget-dev.madonzy.com";
const STAMP = Date.now();
const EMAIL = `uat-investments-${STAMP}@test.local`;
const PASSWORD = "Uat1234!Investments";
const NAME = "Investments UAT";

async function withBudgetGuc(
  budgetId: string,
  run: (c: import("pg").PoolClient) => Promise<void>,
): Promise<void> {
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL_APP not set");
  const pool = new Pool({ connectionString: dbUrl });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${budgetId}}`,
    ]);
    await run(c);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

type Seed = {
  name: string;
  holding_type: string;
  ui_type: string;
  group: string | null;
  qty: string;
  curCents: number;
  curCcy: string;
  buyCents: number | null;
  buyCcy: string | null;
  metal?: string | null;
  metalKind?: string | null;
  uom?: string | null;
};

const SEED: Seed[] = [
  // A "Brokerage" group with two tracked rows → exercise collapse + group-%.
  {
    name: "Apple shares",
    holding_type: "equities",
    ui_type: "equity",
    group: "Brokerage",
    qty: "10",
    curCents: 1980000,
    curCcy: "USD",
    buyCents: 1500000,
    buyCcy: "USD",
  },
  {
    name: "Vanguard S&P 500",
    holding_type: "etf",
    ui_type: "etf",
    group: "Brokerage",
    qty: "5",
    curCents: 2300000,
    curCcy: "USD",
    buyCents: 2000000,
    buyCcy: "USD",
  },
  // A "Metals" group → another collapsible group (precious metals).
  {
    name: "Gold coin (1oz)",
    holding_type: "commodity",
    ui_type: "precious_metals",
    group: "Metals",
    qty: "2",
    curCents: 480000,
    curCcy: "USD",
    buyCents: 400000,
    buyCcy: "USD",
    metal: "gold",
    metalKind: "coin",
    uom: "oz",
  },
  // Ungrouped tail (always visible) — manual collectible + cash.
  {
    name: "Vintage car",
    holding_type: "other",
    ui_type: "collectibles",
    group: null,
    qty: "1",
    curCents: 4500000,
    curCcy: "USD",
    buyCents: 3000000,
    buyCcy: "USD",
  },
  {
    name: "USD cash",
    holding_type: "cash_fx",
    ui_type: "cash",
    group: null,
    qty: "1",
    curCents: 1000000,
    curCcy: "USD",
    buyCents: null,
    buyCcy: null,
  },
];

async function main() {
  console.log(`[provision] base=${BASE} email=${EMAIL}`);
  const { userId, setCookieHeaders } = await signUpViaHttp(
    BASE,
    EMAIL,
    PASSWORD,
    NAME,
  );
  const cookies = setCookieHeaders
    .map((l) => parseSetCookieToPlaywright(l, BASE))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const budgetId = await createBudgetViaHttp(
    BASE,
    cookieHeader,
    "Investments UAT",
  );
  console.log(`[provision] userId=${userId} budgetId=${budgetId}`);

  await withBudgetGuc(budgetId, async (c) => {
    await c.query(
      `UPDATE tenancy.budgets SET investments_enabled = true WHERE id = $1::uuid`,
      [budgetId],
    );
    let sort = 0;
    for (const s of SEED) {
      await c.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, group_name,
            quantity, current_price_cents, current_price_currency,
            buy_price_cents, buy_currency, metal, metal_kind, unit_of_measure,
            sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, $3, $4, $5,
                 $6, $7, $8, $9, $10, $11, $12, $13, $14, now())`,
        [
          budgetId,
          s.name,
          s.holding_type,
          s.ui_type,
          s.group,
          s.qty,
          s.curCents,
          s.curCcy,
          s.buyCents,
          s.buyCcy,
          s.metal ?? null,
          s.metalKind ?? null,
          s.uom ?? null,
          sort++,
        ],
      );
    }
  });

  console.log("\n========== UAT ACCOUNT READY ==========");
  console.log(`URL:      ${BASE}/en/sign-in`);
  console.log(`Email:    ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Budget:   Investments UAT (${budgetId})`);
  console.log(
    `Seeded:   ${SEED.length} holdings (Brokerage x2, Metals x1, ungrouped x2)`,
  );
  console.log("=======================================\n");
}

main().catch((e) => {
  console.error("[provision] FAILED:", e);
  process.exit(1);
});
