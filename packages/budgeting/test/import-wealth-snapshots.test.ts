/**
 * import-wealth-snapshots.test.ts — 15-21 (decision b2): an imported wallet
 * balance history becomes dated wealth snapshots, so the Overview growth chart
 * starts from the user's first day. Imported rows are marked source 'import';
 * only those can ever be deleted, and the worker's own rows stay untouchable.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import type { FxProvider } from "@budget/shared-kernel";
import { importWealthSnapshots } from "../src/application/import-wealth-snapshots";
import { createWealthSnapshotRepo } from "../src/adapters/persistence/wealth-snapshot-repo";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER", "DATABASE_URL_MIGRATOR"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

describe("importWealthSnapshots", () => {
  test("converts each date's wallets at that date and carries investments from the nearest earlier snapshot", async () => {
    const inserted: unknown[] = [];
    const fx = {
      rateAsOf: async (_from: string, _to: string, at: Date) => ({
        rate: at.toISOString().startsWith("2024-01-31") ? "4" : "5",
        provider: "test",
        isStale: false,
      }),
    } as unknown as FxProvider;
    const run = importWealthSnapshots({
      currencyOf: async () => "PLN",
      fx,
      repo: {
        // Strictly before `from`: an investment snapshot sits on 2024-02-15.
        openingBefore: async (_b, from) =>
          from > "2024-02-15"
            ? {
                captured_at: new Date("2024-02-15T00:00:00Z"),
                capitalization_cents: 1n,
                investment_value_cents: 7000n,
                investment_cost_basis_cents: 5000n,
              }
            : null,
        insertImported: async (_b, rows) => {
          inserted.push(...rows);
          return { created: rows.map((r) => ({ id: `id-${r.date}`, date: r.date })), skippedExisting: [] };
        },
      },
    });
    const r = await run({
      budgetId: "b",
      points: [
        {
          date: "2024-01-31",
          wallets: [
            { amountCents: 100000n, currency: "PLN" },
            { amountCents: 10000n, currency: "EUR" },
          ],
        },
        { date: "2024-02-29", wallets: [{ amountCents: 10000n, currency: "EUR" }] },
      ],
    });
    expect(r.isOk()).toBe(true);
    expect(inserted).toEqual([
      {
        date: "2024-01-31",
        capturedAt: new Date("2024-01-31T23:00:00Z"),
        capitalizationCents: 140000n,
        investmentValueCents: 0n,
        investmentCostBasisCents: null,
        currency: "PLN",
      },
      {
        date: "2024-02-29",
        capturedAt: new Date("2024-02-29T23:00:00Z"),
        capitalizationCents: 57000n,
        investmentValueCents: 7000n,
        investmentCostBasisCents: 5000n,
        currency: "PLN",
      },
    ]);
    expect(r._unsafeUnwrap()).toEqual({
      created: [
        { id: "id-2024-01-31", date: "2024-01-31" },
        { id: "id-2024-02-29", date: "2024-02-29" },
      ],
      skipped_existing: [],
    });
  });
});

describe("wealth snapshot repo — imported rows", () => {
  const tenant = crypto.randomUUID();
  const user = crypto.randomUUID();
  let workerId = "";
  const db = async <T>(fn: (c: import("pg").PoolClient) => Promise<T>) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
    const c = await pool.connect();
    try {
      await c.query(
        `SELECT set_config('app.current_user_id', $1, false), set_config('app.tenant_ids', $2, false)`,
        [user, `{${tenant}}`],
      );
      return await fn(c);
    } finally {
      c.release();
      await pool.end();
    }
  };

  beforeAll(async () => {
    await db(async (c) => {
      await c.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'Snap', true, now(), now())`,
        [user, `snap-${user.slice(0, 8)}@example.com`],
      );
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, timezone)
         VALUES ($1, $2, 'Snap', 'PRIVATE', 'PLN', $3, 1, now(), 'UTC')`,
        [tenant, `snap-${tenant.slice(0, 8)}`, user],
      );
      // The worker's INSERT names no source.
      const w = await c.query(
        `INSERT INTO budgeting.budget_wealth_snapshots
           (tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents, currency)
         VALUES ($1, $1, '2024-01-31T00:00:00Z', 500, 0, 'PLN') RETURNING id, source`,
        [tenant],
      );
      workerId = w.rows[0].id;
      expect(w.rows[0].source).toBe("worker");
    });
  });

  afterAll(async () => {
    await db(async (c) => {
      await c.query(`DELETE FROM budgeting.budget_wealth_snapshots WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM tenancy.budgets WHERE id = $1`, [tenant]);
    });
  });

  const row = (date: string) => ({
    date,
    capturedAt: new Date(`${date}T23:00:00Z`),
    capitalizationCents: 1000n,
    investmentValueCents: 0n,
    investmentCostBasisCents: null,
    currency: "PLN",
  });

  test("writes source 'import', skipping a day that already has a snapshot", async () => {
    const repo = createWealthSnapshotRepo();
    const r = await repo.insertImported(tenant, [row("2024-01-31"), row("2024-02-29")]);
    expect(r.skippedExisting).toEqual(["2024-01-31"]);
    expect(r.created.map((x) => x.date)).toEqual(["2024-02-29"]);
    const src = await db((c) =>
      c.query(`SELECT source FROM budgeting.budget_wealth_snapshots WHERE id = $1`, [r.created[0]!.id]),
    );
    expect(src.rows[0].source).toBe("import");
  });

  test("deletes only imported rows; a worker snapshot is never deleted", async () => {
    const repo = createWealthSnapshotRepo();
    const made = (await repo.insertImported(tenant, [row("2024-03-31")])).created[0]!;
    expect(await repo.deleteImported(tenant, workerId)).toBe(false);
    expect(await repo.deleteImported(tenant, made.id)).toBe(true);
    expect(await repo.deleteImported(tenant, made.id)).toBe(false);
    const left = await db((c) =>
      c.query(`SELECT id FROM budgeting.budget_wealth_snapshots WHERE id = ANY($1::uuid[])`, [[workerId, made.id]]),
    );
    expect(left.rows.map((x) => x.id)).toEqual([workerId]);
  });
});
