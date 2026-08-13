/**
 * one-offs.test.ts — "which spend won't happen again", paginated (user, 260813).
 *
 * The dialog used to offer a shortlist: the five biggest spends per category,
 * and only those clearing half that category's average limit. Most of a
 * household's spending was therefore invisible to a decision it is entitled to
 * make — "why don't I see the 108 and the 127?".
 *
 * It now lists EVERY spend in the range, biggest first, ten at a time. Real
 * Postgres: keyset pagination is SQL, and a fake would prove nothing about it.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

const FROM = "2026-01-01";
const TO = "2026-12-31";

interface Fixture {
  userId: string;
  budgetId: string;
  categoryA: string;
  categoryB: string;
}

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryA = crypto.randomUUID();
  const categoryB = crypto.randomUUID();
  const ruleMonthly = crypto.randomUUID();
  const ruleOnce = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    // The seed runs as app_role, so RLS needs the tenant in scope — same
    // bootstrapping as the other real-Postgres route tests.
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'One-offs Test', true, now(), now())`,
      [userId, `oneoff-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          cushion_enabled, cushion_target_months, created_at)
       VALUES ($1, $2, 'One-offs Budget', 'PRIVATE', 'PLN', $3, 1, true, 6, now())`,
      [budgetId, `ws-oneoff-${budgetId.slice(0, 8)}`, userId],
    );
    for (const [id, name, idx] of [
      [categoryA, "Alpha", 0],
      [categoryB, "Beta", 1],
    ] as const) {
      await client.query(
        `INSERT INTO budgeting.categories
           (id, tenant_id, name, created_at, actor_user_id, sort_index)
         VALUES ($1, $2, $3, now(), $4, $5)`,
        [id, budgetId, name, userId, idx],
      );
    }
    // A ONCE payment carries no anchor — the schema insists, and rightly:
    // its date IS the occurrence.
    for (const [id, cadence, anchor] of [
      [ruleMonthly, "MONTHLY", 15],
      [ruleOnce, "ONCE", null],
    ] as const) {
      await client.query(
        `INSERT INTO budgeting.scheduled_payments
           (id, tenant_id, category_id, amount, currency, cadence,
            cadence_anchor, next_due_date, active, created_at, actor_user_id, note)
         VALUES ($1, $2, $3, 500, 'PLN', $4, $5, '2026-09-15', true, now(), $6, 'rule')`,
        [id, budgetId, categoryA, cadence, anchor, userId],
      );
    }

    // 24 ordinary spends in Alpha: 100, 200 … 2400 zł. Plus one tiny one, the
    // kind the old size bar hid.
    const rows: [string, number, string | null][] = [];
    for (let i = 1; i <= 24; i++) {
      rows.push([categoryA, i * 10000, null]);
    }
    rows.push([categoryA, 800, null]); // 8 zł — far under any bar
    rows.push([categoryB, 50000, null]); // another category
    rows.push([categoryA, 900000, ruleMonthly]); // repeats → never a candidate
    rows.push([categoryA, 850000, ruleOnce]); // a single planned purchase → yes
    let day = 1;
    for (const [categoryId, cents, ruleId] of rows) {
      const date = `2026-0${((day % 9) + 1).toString()}-${String((day % 27) + 1).padStart(2, "0")}`;
      day += 1;
      await client.query(
        `INSERT INTO budgeting.expense_ledger
           (id, tenant_id, budget_id, category_id, transaction_date, kind, note,
            currency_original, amount_original_cents, amount_converted_cents,
            fx_rate, fx_as_of, confirmed_at, scheduled_payment_id)
         VALUES (gen_random_uuid(), $1, $1, $2, $3::date, 'SPENDING', $4,
                 'PLN', $5, $5, 1, $3::date, now(), $6)`,
        [budgetId, categoryId, date, `spend ${cents}`, cents, ruleId],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId, categoryA, categoryB };
}

async function buildApp(fix: Fixture) {
  const { registerReserveFitRoutes } =
    await import("../../src/routes/reserve-fit");
  const { createReserveFitRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserve-fit-repo");
  const { listOneOffCandidates } =
    await import("@budget/budgeting/src/application/list-one-off-candidates");

  const deps = {
    budgeting: {
      listOneOffCandidates: listOneOffCandidates({
        reserveFitRepo: createReserveFitRepo(),
      }),
      getReserveFit: async () => ok({ currency: "PLN", rows: [] }),
      setReserveFitExclusions: async () => ok(undefined),
    },
  } as never;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: fix.userId } });
    c.set("tenantIds", [fix.budgetId]);
    await next();
  });
  const budgets = new Hono();
  registerReserveFitRoutes(budgets, deps);
  app.route("/budgets", budgets);
  return app;
}

const { ok } = await import("@budget/shared-kernel");

interface Page {
  items: {
    ledger_id: string;
    category_id: string;
    amount_cents: string;
    scheduled_cadence: string | null;
    excluded: boolean;
  }[];
  next_cursor: string | null;
}

describe("GET /budgets/:id/overview/one-offs", () => {
  let fix: Fixture;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    fix = await createFixture();
    app = await buildApp(fix);
  });

  const fetchPage = async (query: string): Promise<Page> => {
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/one-offs?from=${FROM}&to=${TO}${query}`,
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Page;
  };

  test("hands back ten at a time, biggest first", async () => {
    const page = await fetchPage("");
    expect(page.items).toHaveLength(10);
    const amounts = page.items.map((i) => Number(i.amount_cents));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    expect(page.next_cursor).not.toBeNull();
  });

  test("the cursor walks the whole range without repeating a row", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Page = await fetchPage(
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : "",
      );
      for (const item of page.items) {
        expect(seen.has(item.ledger_id)).toBe(false);
        seen.add(item.ledger_id);
      }
      cursor = page.next_cursor;
      pages += 1;
      expect(pages).toBeLessThan(20); // never loop forever
    } while (cursor);
    // 24 ordinary + the 8 zł + the ONCE purchase, in Alpha and Beta.
    // The MONTHLY one is not a candidate.
    expect(seen.size).toBe(27);
  });

  test("shows the small spends the old size bar hid", async () => {
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page: Page = await fetchPage(
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : "",
      );
      seen.push(...page.items.map((i) => Number(i.amount_cents)));
      cursor = page.next_cursor;
    } while (cursor);
    expect(seen).toContain(800);
  });

  test("a repeating charge is never offered, a one-time one is", async () => {
    const cadences: (string | null)[] = [];
    let cursor: string | null = null;
    do {
      const page: Page = await fetchPage(
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : "",
      );
      cadences.push(...page.items.map((i) => i.scheduled_cadence));
      cursor = page.next_cursor;
    } while (cursor);
    expect(cadences).toContain("ONCE");
    expect(cadences).not.toContain("MONTHLY");
  });

  test("narrows to one category on request", async () => {
    const page = await fetchPage(`&category=${fix.categoryB}`);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.category_id).toBe(fix.categoryB);
    expect(page.next_cursor).toBeNull();
  });

  test("unknown budget → 404 (IDOR guard)", async () => {
    const res = await app.request(
      `/budgets/00000000-0000-0000-0000-0000000000ff/overview/one-offs?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(404);
  });
});
