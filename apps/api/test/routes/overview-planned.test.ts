/**
 * overview-planned.test.ts — Integration test for GET /budgets/:id/overview/planned
 * (Phase 11 Plan 11-04, D-12/13/14/20, T-11-03). Real Postgres, real overview-repo.
 *
 * Exercises the multi-month SQL: SCD-2 limit active per month, per-month mode from
 * budget_mode_history (March = CUSHION → cushion_amount), confirmed-only real
 * (pending excluded), planned-avg over active months, scheduled chart, adaptive
 * daily bucket, and the Zod range guard. NO DB mocking.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  budgetId: string;
  categoryId: string;
}

async function withTenant<T>(
  budgetId: string,
  userId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function createFixture(): Promise<Fixture> {
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Planned Test', true, now(), now())`,
      [userId, `planned-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Planned Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-pl-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  await withTenant(budgetId, userId, async (c) => {
    // Category created before the range (Dec 2025).
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Food', '2025-12-01T00:00:00Z', $3)`,
      [categoryId, budgetId, userId],
    );
    // SCD-2 limit: normal 200.00, cushion 150.00, active from 2026-01-01.
    await c.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, actor_user_id, created_at)
       VALUES ($1, $2, $3, 20000, 'USD', 15000, 'USD', '2026-01-01', $4, now())`,
      [crypto.randomUUID(), budgetId, categoryId, userId],
    );
    // March is a CUSHION month (NORMAL is the COALESCE default for Jan/Feb).
    await c.query(
      `INSERT INTO budgeting.budget_mode_history
         (id, budget_id, tenant_id, mode, effective_from, effective_to, actor_user_id, created_at)
       VALUES ($1, $2, $2, 'CUSHION', '2026-03-01', NULL, $3, now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    // Confirmed spend per month.
    for (const [date, amt] of [
      ["2026-01-10", 18000],
      ["2026-02-10", 21000],
      ["2026-03-10", 14000],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.expense_ledger
           (id, tenant_id, budget_id, category_id, currency_original, amount_original_cents,
            amount_converted_cents, fx_rate, fx_as_of, transaction_date, kind, confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'USD', $5, $5, 1, $6::date, $6::date, 'SPENDING', now(), now(), now())`,
        [crypto.randomUUID(), budgetId, budgetId, categoryId, amt, date],
      );
    }
    // A PENDING draft in Feb (confirmed_at NULL) — must be EXCLUDED from real.
    await c.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, currency_original, amount_original_cents,
          amount_converted_cents, fx_rate, fx_as_of, transaction_date, kind, confirmed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'USD', 5000, 5000, 1, '2026-02-15'::date, '2026-02-15'::date, 'SPENDING', NULL, now(), now())`,
      [crypto.randomUUID(), budgetId, budgetId, categoryId],
    );
    // An INVESTMENT category with spend in the same days. It counts like any
    // other category now (260803 user request): both the monthly and the daily
    // line carry it, and it appears in the by-category chart.
    const investId = crypto.randomUUID();
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, is_investment, created_at, actor_user_id)
       VALUES ($1, $2, 'Investing', true, '2025-12-01T00:00:00Z', $3)`,
      [investId, budgetId, userId],
    );
    await c.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, currency_original, amount_original_cents,
          amount_converted_cents, fx_rate, fx_as_of, transaction_date, kind, confirmed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'USD', 99000, 99000, 1, '2026-01-12'::date, '2026-01-12'::date, 'SPENDING', now(), now(), now())`,
      [crypto.randomUUID(), budgetId, budgetId, investId],
    );
    // Active MONTHLY scheduled rule: 100.00 USD on Food.
    await c.query(
      `INSERT INTO budgeting.scheduled_payments
         (id, tenant_id, category_id, amount, currency, cadence, next_due_date, active, actor_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, 100.00, 'USD', 'MONTHLY', '2026-07-01', true, $4, now(), now())`,
      [crypto.randomUUID(), budgetId, categoryId, userId],
    );
  });
  return { userId, budgetId, categoryId };
}

async function buildApp(opts: { userId: string; allowedTenantIds: string[] }) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { getOverviewPlanned } =
    await import("@budget/budgeting/src/application/get-overview-planned");
  const { createOverviewRepo } =
    await import("@budget/budgeting/src/adapters/persistence/overview-repo");
  const { createBudgetHomeSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/budget-home-summary-repo");
  const { FrankfurterFxProvider } =
    await import("@budget/budgeting/src/adapters/fx/frankfurter");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool } = await import("@budget/platform");

  const fxProvider = new FrankfurterFxProvider(
    new DrizzleFxRateCacheRepo(workerPool()),
  );
  const getOverviewPlannedUC = getOverviewPlanned({
    repo: createOverviewRepo(),
    metaReader: createBudgetHomeSummaryRepo(),
    fxProvider,
  });

  const deps = {
    budgeting: { getOverviewPlanned: getOverviewPlannedUC },
    tenancy: {
      workspaceRepo: { listForUser: async () => [] },
      memberShareRepo: { update: async () => {} },
    },
    identity: {
      auth: { api: {} },
      userRepo: { setActiveWorkspaceIds: async () => {} },
    },
  } as never;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    c.set("tenantIds", opts.allowedTenantIds);
    await next();
  });
  app.route("/budgets", budgetsRoutesFactory(deps));
  return app;
}

describe("GET /budgets/:id/overview/planned", () => {
  let fix: Fixture;
  let other: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
    other = await createFixture();
  });

  it("monthly bucket: SCD-2 planned (March=cushion), confirmed-only real, planned-avg, scheduled", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/planned?from=2026-01-01&to=2026-03-31`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currency: string;
      bucket: string;
      timeline: {
        label: string;
        planned_cents: string;
        real_cents: string;
        within_limit_cents: string;
        reserve_used_cents: string;
        overspent_cents: string;
      }[];
      plannedAvgVsReal: {
        category_id: string;
        planned_avg_cents: string;
        real_avg_cents: string;
      }[];
      scheduledPerMonth: { month: string; planned_cents: string }[];
    };
    expect(body.currency).toBe("USD");
    expect(body.bucket).toBe("monthly");
    expect(body.timeline.map((p) => p.label)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    // planned: Jan/Feb NORMAL 20000, March CUSHION 15000
    expect(body.timeline.map((p) => p.planned_cents)).toEqual([
      "20000",
      "20000",
      "15000",
    ]);
    // Every point carries the month's spend split — limit, reserve, overspend —
    // which is what sets the line's colour proportions.
    for (const p of body.timeline) {
      expect(BigInt(p.within_limit_cents)).toBeLessThanOrEqual(
        BigInt(p.real_cents),
      );
      expect(
        BigInt(p.within_limit_cents) +
          BigInt(p.reserve_used_cents) +
          BigInt(p.overspent_cents),
      ).toBe(BigInt(p.real_cents));
    }
    // real: confirmed only — the Feb pending 5000 is excluded. January also
    // carries the 990.00 invested on the 12th: investing counts like any other
    // outgoing now (260803 user request).
    expect(body.timeline.map((p) => p.real_cents)).toEqual([
      "117000",
      "21000",
      "14000",
    ]);
    const food = body.plannedAvgVsReal.find(
      (c) => c.category_id === fix.categoryId,
    )!;
    expect(food.planned_avg_cents).toBe("18333"); // (20000+20000+15000)/3
    expect(food.real_avg_cents).toBe("17667"); // (18000+21000+14000)/3
    // 260807: the series is UPCOMING months, keyed "YYYY-MM", running from this
    // month to the furthest next-due — not a calendar year of slots 1..12. The
    // per-CATEGORY cut went with the chart that used it (260804).
    expect(body.scheduledPerMonth.length).toBeGreaterThan(0);
    for (const m of body.scheduledPerMonth)
      expect(m.month).toMatch(/^\d{4}-\d{2}$/);
    // The seeded MONTHLY 100.00 shows as its own amount in the months it fires,
    // never averaged away.
    expect(
      body.scheduledPerMonth.some((m) => m.planned_cents === "10000"),
    ).toBe(true);
  });

  it("daily bucket for a within-month range (D-20)", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/planned?from=2026-01-01&to=2026-01-15`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bucket: string;
      timeline: { label: string; real_cents: string }[];
    };
    expect(body.bucket).toBe("daily");
    // Food's 180.00 on the 10th plus the 990.00 invested on the 12th.
    expect(body.timeline.at(-1)!.real_cents).toBe("117000");
  });

  it("a mid-month limit change shows the LATEST limit for that month", async () => {
    // 260801 user report: 6M+ month ticks must carry the month's latest value.
    // The query resolved the limit at the month START, so a limit raised on the
    // 20th still drew the old figure for the whole month.
    const f = await createFixture();
    await withTenant(f.budgetId, f.userId, async (c) => {
      await c.query(
        `UPDATE budgeting.category_limits
            SET effective_to = '2026-01-20'
          WHERE tenant_id = $1 AND category_id = $2`,
        [f.budgetId, f.categoryId],
      );
      await c.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id, normal_amount, normal_currency,
            cushion_amount, cushion_currency, effective_from, actor_user_id, created_at)
         VALUES ($1, $2, $3, 55000, 'USD', 15000, 'USD', '2026-01-20', $4, now())`,
        [crypto.randomUUID(), f.budgetId, f.categoryId, f.userId],
      );
    });
    const app = await buildApp({
      userId: f.userId,
      allowedTenantIds: [f.budgetId],
    });
    const res = await app.request(
      `/budgets/${f.budgetId}/overview/planned?from=2026-01-01&to=2026-03-31`,
    );
    const body = (await res.json()) as {
      timeline: { label: string; planned_cents: string }[];
    };
    const jan = body.timeline.find((p) => p.label === "2026-01")!;
    expect(jan.planned_cents).toBe("55000");
  });

  it("honours an INCLUSIVE effective_to (last day of the month)", async () => {
    // 260801: reconstructed limits (e.g. the House backfill) close a period on the
    // month's LAST DAY, while the app's own SCD-2 split closes it on the NEXT
    // period's first day. A month-end lookup with a strict `>` dropped every
    // inclusive row — the category vanished from the planned line entirely.
    const f = await createFixture();
    await withTenant(f.budgetId, f.userId, async (c) => {
      await c.query(
        `UPDATE budgeting.category_limits
            SET effective_from = '2026-01-01', effective_to = '2026-01-31'
          WHERE tenant_id = $1 AND category_id = $2`,
        [f.budgetId, f.categoryId],
      );
    });
    const app = await buildApp({
      userId: f.userId,
      allowedTenantIds: [f.budgetId],
    });
    const res = await app.request(
      `/budgets/${f.budgetId}/overview/planned?from=2026-01-01&to=2026-03-31`,
    );
    const body = (await res.json()) as {
      timeline: { label: string; planned_cents: string }[];
    };
    const jan = body.timeline.find((p) => p.label === "2026-01")!;
    expect(jan.planned_cents).toBe("20000");
    // …and the period really ends there: February has no limit in force, so its
    // point is present (every month in range is) but planned drops to zero.
    expect(
      body.timeline.find((p) => p.label === "2026-02")!.planned_cents,
    ).toBe("0");
  });

  it("rejects an inverted range with 400 (T-11-03)", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/planned?from=2026-03-31&to=2026-01-01`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 cross-tenant (T-11-03)", async () => {
    const app = await buildApp({
      userId: other.userId,
      allowedTenantIds: [other.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/planned?from=2026-01-01&to=2026-03-31`,
    );
    expect(res.status).toBe(404);
  });

  it("counts investment spend in the DAILY line, like any other category", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    // A single month → daily bucket.
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/planned?from=2026-01-01&to=2026-01-31`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bucket: string;
      timeline: {
        real_cents: string;
        within_limit_cents: string;
        reserve_used_cents: string;
        overspent_cents: string;
      }[];
    };
    expect(body.bucket).toBe("daily");
    const last = body.timeline[body.timeline.length - 1]!;
    // Food's 180.00 PLUS the 990.00 invested — the household's whole outgoing.
    expect(last.real_cents).toBe("117000");
    // …so the split still accounts for every cent the line draws.
    expect(
      BigInt(last.within_limit_cents) +
        BigInt(last.reserve_used_cents) +
        BigInt(last.overspent_cents),
    ).toBe(BigInt(last.real_cents));
  });

  it("lists the Investments category in the by-category chart", async () => {
    // It used to be dropped from plannedAvgVsReal, which feeds BOTH "How far off
    // plan, by category" and the "Planned spendings, by category" pie (260803
    // user request).
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/planned?from=2026-01-01&to=2026-03-31`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plannedAvgVsReal: { name: string; real_avg_cents: string }[];
    };
    const row = body.plannedAvgVsReal.find((r) => r.name === "Investing");
    expect(row).toBeTruthy();
    // 990.00 invested once over the three months it was active.
    expect(BigInt(row!.real_avg_cents)).toBeGreaterThan(0n);
  });
});
