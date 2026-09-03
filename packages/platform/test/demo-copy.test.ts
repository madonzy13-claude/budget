/**
 * demo-copy.test.ts — the wipe-and-copy engine against a real Postgres.
 *
 * The assertions that matter most are the negative ones: no source text
 * survives, no destination row references a source id, and a failure leaves the
 * previous night's demo standing. Row counts matching is the easy part.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool, type PoolClient } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import {
  refreshPair,
  levelWealthHistory,
  type CopyPair,
} from "../src/demo/copy";

let pool: Pool;

const SOURCE = "11111111-1111-1111-1111-111111111111";
const DEST = "22222222-2222-2222-2222-222222222222";
const OWNER_USER = "33333333-3333-3333-3333-333333333333";
const DEMO_USER = "44444444-4444-4444-4444-444444444444";

/** Strings that must never appear anywhere in the destination tenant. */
const SECRETS = [
  "Grochale rent private",
  "Salary from Acme Holdings",
  "Kowalski family savings",
  "Secret Wallet Name",
];

beforeAll(async () => {
  // app_role, not migrator or worker_role. RLS policies here are granted TO
  // app_role/worker_role specifically, so a migrator connection has no
  // applicable policy and is denied outright. Between the two, only app_role
  // already holds the CRUD this copy needs — worker_role would have to be
  // granted DELETE on the append-only expense_ledger and write access to
  // tenancy.*, which is a real privilege expansion for every job in the worker.
  // So the refresh opens an app_role connection, and the test uses the same.
  const { urlApp } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  await seed();
}, 180_000);

afterAll(async () => {
  await pool?.end();
});

async function seed() {
  const c = await pool.connect();
  try {
    // RLS applies to the seeding connection too — budgets/categories/wallets
    // all key on app.tenant_ids. Announce both tenants for the seed, the same
    // way the refresh job does for itself.
    await c.query(`SET app.tenant_ids = '{${SOURCE},${DEST}}'`);
    await c.query(`SET app.current_user_id = '${OWNER_USER}'`);
    // No identity.users rows: tenancy/shared_kernel carry no DB-level FK to
    // identity.users (the account-deletion cascade is application-level for
    // exactly that reason), and identity.users is itself RLS-guarded. The copy
    // engine only ever writes user ids as opaque values.
    for (const [id, name, slug] of [
      [SOURCE, SECRETS[2], "src-budget"],
      [DEST, "demo-placeholder", "demo-budget"],
    ] as const) {
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
         VALUES ($1, $3, $2, 'PLN', $4, now()) ON CONFLICT (id) DO NOTHING`,
        [id, name, slug, OWNER_USER],
      );
    }
    // Source content: categories, a mixed-currency wallet set incl. a negative
    // credit-card balance, and ledger rows carrying private notes.
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id, sort_index)
       VALUES ('aaaaaaaa-0000-0000-0000-000000000001', $1, $2, now(), $3, 0)`,
      [SOURCE, SECRETS[0], OWNER_USER],
    );
    await c.query(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance, created_at, actor_user_id)
       VALUES
         ('bbbbbbbb-0000-0000-0000-000000000001', $1, $2, 'PLN', 4000.0000, now(), $3),
         ('bbbbbbbb-0000-0000-0000-000000000002', $1, 'EUR pot', 'EUR', 1000.0000, now(), $3),
         ('bbbbbbbb-0000-0000-0000-000000000003', $1, 'card', 'PLN', -2500.0000, now(), $3)`,
      [SOURCE, SECRETS[3], OWNER_USER],
    );
    await c.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, wallet_id, note, currency_original,
          fx_rate, fx_as_of, amount_original_cents, amount_converted_cents, transaction_date, kind, created_at)
       VALUES
         ('cccccccc-0000-0000-0000-000000000001', $1, $1,
          'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
          $2, 'PLN', 1.0, current_date, 100000, 100000, current_date, 'expense', now()),
         ('cccccccc-0000-0000-0000-000000000002', $1, $1,
          'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
          $3, 'EUR', 4.3, current_date, 50000, 50000, current_date, 'expense', now())`,
      [SOURCE, SECRETS[1], "another private note"],
    );
  } finally {
    c.release();
  }
}

function pairFor(scale: number, map: Record<string, string>): CopyPair {
  return {
    source: SOURCE,
    dest: DEST,
    label: "personal",
    currency: "USD",
    currencyMap: map,
    moneyScale: scale,
    demoUserId: DEMO_USER,
    budgetName: "Personal",
    textLocale: "en" as const,
  };
}

async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

describe("refreshPair", () => {
  test("copies every row of every copied table", async () => {
    const counts = await inTx((c) =>
      refreshPair(c, pairFor(0.25, { PLN: "USD" })),
    );
    expect(counts["budgeting.categories"]).toBe(1);
    expect(counts["budgeting.wallets"]).toBe(3);
    expect(counts["budgeting.expense_ledger"]).toBe(2);
  });

  test("no source text survives anywhere in the demo tenant", async () => {
    // The scrub's core promise, checked against the actual destination rows
    // rather than against the transform in isolation.
    for (const table of ["budgeting.categories", "budgeting.wallets"]) {
      const { rows } = await pool.query(
        `SELECT name FROM ${table} WHERE tenant_id = $1`,
        [DEST],
      );
      for (const r of rows) {
        for (const s of SECRETS) expect(r.name).not.toBe(s);
      }
    }
    const { rows: led } = await pool.query(
      `SELECT note FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [DEST],
    );
    for (const r of led) {
      for (const s of SECRETS) expect(r.note).not.toBe(s);
      expect(r.note).not.toBe("another private note");
    }
  });

  test("money is scaled uniformly and signs are preserved", async () => {
    const { rows } = await pool.query(
      `SELECT currency, current_balance FROM budgeting.wallets
        WHERE tenant_id = $1 ORDER BY current_balance`,
      [DEST],
    );
    const balances = rows
      .map((r) => Number(r.current_balance))
      .sort((a, b) => a - b);
    // 4000, 1000, -2500 at 0.25 → 1000, 250, -625
    expect(balances).toEqual([-625, 250, 1000]);
  });

  test("PLN is relabeled to USD while other currencies are untouched", async () => {
    const { rows } = await pool.query(
      `SELECT currency, count(*)::int n FROM budgeting.wallets
        WHERE tenant_id = $1 GROUP BY 1 ORDER BY 1`,
      [DEST],
    );
    const byCcy = Object.fromEntries(rows.map((r) => [r.currency, r.n]));
    expect(byCcy["USD"]).toBe(2);
    expect(byCcy["EUR"]).toBe(1);
    expect(byCcy["PLN"]).toBeUndefined();
  });

  test("an empty currency map keeps PLN — the family pair", async () => {
    await inTx((c) =>
      refreshPair(c, { ...pairFor(0.9, {}), currency: "PLN", label: "family" }),
    );
    const { rows } = await pool.query(
      `SELECT DISTINCT currency FROM budgeting.wallets WHERE tenant_id = $1 ORDER BY 1`,
      [DEST],
    );
    expect(rows.map((r) => r.currency)).toEqual(["EUR", "PLN"]);
  });

  test("no destination row references a source id", async () => {
    await inTx((c) => refreshPair(c, pairFor(0.25, { PLN: "USD" })));
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM budgeting.expense_ledger
        WHERE tenant_id = $1
          AND (id::text LIKE 'cccccccc%' OR category_id::text LIKE 'aaaaaaaa%'
               OR wallet_id::text LIKE 'bbbbbbbb%')`,
      [DEST],
    );
    expect(rows[0].n).toBe(0);
  });

  test("foreign keys inside the demo tenant resolve", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM budgeting.expense_ledger l
         LEFT JOIN budgeting.categories c ON c.id = l.category_id
         LEFT JOIN budgeting.wallets w ON w.id = l.wallet_id
        WHERE l.tenant_id = $1 AND (c.id IS NULL OR w.id IS NULL)`,
      [DEST],
    );
    expect(rows[0].n).toBe(0);
  });

  test("the demo budget keeps its configured id and gets the pair's currency", async () => {
    const { rows } = await pool.query(
      `SELECT name, default_currency FROM tenancy.budgets WHERE id = $1`,
      [DEST],
    );
    expect(rows[0].name).toBe("Personal");
    expect(rows[0].default_currency).toBe("USD");
  });

  test("the demo user is a member of the demo budget and nothing else", async () => {
    // The isolation invariant, asserted at the point it is created.
    const { rows } = await pool.query(
      `SELECT budget_id FROM tenancy.budget_members WHERE user_id = $1`,
      [DEMO_USER],
    );
    expect(rows.map((r) => r.budget_id)).toEqual([DEST]);
  });

  test("a re-run replaces rather than accumulates", async () => {
    const before = await pool.query(
      `SELECT count(*)::int n FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [DEST],
    );
    await inTx((c) => refreshPair(c, pairFor(0.25, { PLN: "USD" })));
    const after = await pool.query(
      `SELECT count(*)::int n FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [DEST],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  test("a failure mid-run leaves the previous demo standing", async () => {
    // The rollback guarantee. Without it, a bad night would leave the demo
    // wiped or half-scrubbed — worse than stale.
    const before = await pool.query(
      `SELECT count(*)::int n, min(note) note FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [DEST],
    );
    expect(before.rows[0].n).toBeGreaterThan(0);

    await expect(
      inTx(async (c) => {
        await refreshPair(c, pairFor(0.25, { PLN: "USD" }));
        throw new Error("boom, mid-refresh");
      }),
    ).rejects.toThrow("boom");

    const after = await pool.query(
      `SELECT count(*)::int n, min(note) note FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [DEST],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(after.rows[0].note).toBe(before.rows[0].note);
  });

  test("wipe-only tables are cleared and never repopulated", async () => {
    await pool.query(
      `INSERT INTO shared_kernel.push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'https://push.example/x', 'k', 'a', now())`,
      [DEST, DEMO_USER],
    );
    await inTx((c) => refreshPair(c, pairFor(0.25, { PLN: "USD" })));
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM shared_kernel.push_subscriptions WHERE tenant_id = $1`,
      [DEST],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("text pool uniqueness", () => {
  test("more rows than pool entries still produce distinct names", async () => {
    // Found on live data: the owner has 19 categories and the pool has 15
    // names, so a hash-based pick collided and
    // `categories_unique_name_per_tenant` aborted the entire refresh. The pick
    // must walk an ordinal and lap with a suffix instead.
    const c = await pool.connect();
    try {
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{${SOURCE},${DEST}}`,
      ]);
      await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
        OWNER_USER,
      ]);
      // 40 categories — comfortably past every pool's length.
      for (let i = 0; i < 40; i++) {
        await c.query(
          `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id, sort_index)
           VALUES (gen_random_uuid(), $1, $2, now(), $3, $4)
           ON CONFLICT DO NOTHING`,
          [SOURCE, `Owner category ${i}`, OWNER_USER, i + 10],
        );
      }
    } finally {
      c.release();
    }

    await inTx((cl) => refreshPair(cl, pairFor(0.25, { PLN: "USD" })));

    const { rows } = await pool.query(
      `SELECT count(*)::int AS total, count(DISTINCT name)::int AS distinct_names
         FROM budgeting.categories WHERE tenant_id = $1`,
      [DEST],
    );
    expect(rows[0].total).toBeGreaterThan(20);
    expect(rows[0].distinct_names).toBe(rows[0].total);
  });
});

describe("readability of the copied demo", () => {
  test("limits land on round numbers, transactions do not", async () => {
    // User-reported: a category limit rendered as $231,209. Limits are targets,
    // so rounding them breaks nothing; transactions must NOT be rounded or the
    // category totals would stop matching the rows behind them.
    const c = await pool.connect();
    try {
      await c.query(`SET app.tenant_ids = '{${SOURCE},${DEST}}'`);
      await c.query(`SET app.current_user_id = '${OWNER_USER}'`);
      await c.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id, normal_amount, normal_currency,
            cushion_amount, cushion_currency,
            effective_from, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, 'aaaaaaaa-0000-0000-0000-000000000001',
                 92483700, 'PLN', 71234500, 'PLN', current_date, $2, now())`,
        [SOURCE, OWNER_USER],
      );
    } finally {
      c.release();
    }

    await inTx((cl) => refreshPair(cl, pairFor(0.25, { PLN: "USD" })));

    const { rows } = await pool.query(
      `SELECT normal_amount FROM budgeting.category_limits WHERE tenant_id = $1`,
      [DEST],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const major = Number(r.normal_amount) / 100;
      // Every limit sits on its magnitude's step — no 231,209-style noise.
      const a = Math.abs(major);
      const step =
        a < 20
          ? 1
          : a < 100
            ? 5
            : Math.abs(major) < 1000
              ? 10
              : Math.abs(major) < 10000
                ? 50
                : Math.abs(major) < 100000
                  ? 500
                  : 1000;
      expect(major % step).toBe(0);
    }
  });

  test("a transaction's note belongs to its own category", async () => {
    // User-reported: notes read like lorem ipsum. A note must come from the
    // vocabulary of the category it sits in.
    const { rows } = await pool.query(
      `SELECT c.name AS category, l.note
         FROM budgeting.expense_ledger l
         JOIN budgeting.categories c ON c.id = l.category_id
        WHERE l.tenant_id = $1 AND l.note IS NOT NULL`,
      [DEST],
    );
    expect(rows.length).toBeGreaterThan(0);

    const { poolValues, merchantsForCategory, categoryCount } =
      await import("../src/demo/pools");
    const categories = poolValues("en", "category");
    for (const r of rows) {
      const idx = categories.indexOf(r.category);
      if (idx < 0) continue; // lapped name; covered by the uniqueness test
      const allowed = merchantsForCategory("en", idx % categoryCount("en"));
      expect({
        category: r.category,
        note: r.note,
        ok: allowed.includes(r.note),
      }).toEqual({ category: r.category, note: r.note, ok: true });
    }
  });

  test("a Polish demo is written in Polish, not translated at render time", async () => {
    await inTx((cl) =>
      refreshPair(cl, {
        ...pairFor(0.25, {}),
        currency: "PLN",
        label: "personal-pl",
        textLocale: "pl",
        budgetName: "Osobisty",
      }),
    );
    const { rows } = await pool.query(
      `SELECT name FROM budgeting.categories WHERE tenant_id = $1`,
      [DEST],
    );
    const { poolValues } = await import("../src/demo/pools");
    const polish = new Set(poolValues("pl", "category"));
    const english = new Set(poolValues("en", "category"));
    const names = rows.map((r) => String(r.name).replace(/ \d+$/, ""));

    // Every name comes from the Polish vocabulary.
    for (const name of names) {
      expect({ name, fromPolishPool: polish.has(name) }).toEqual({
        name,
        fromPolishPool: true,
      });
    }
    // And it is genuinely Polish, not the English set by coincidence: some
    // words ARE identical across the two ("Transport"), so the discriminator is
    // that at least one name exists ONLY in Polish.
    expect(names.some((n) => !english.has(n))).toBe(true);
  });
});

describe("wealth levelling", () => {
  /** A source history to level: two points, so shape is observable. */
  async function seedSourceHistory() {
    const c = await pool.connect();
    try {
      await c.query(`SET app.tenant_ids = '{${SOURCE},${DEST}}'`);
      await c.query(`SET app.current_user_id = '${OWNER_USER}'`);
      for (const [days, cap, inv] of [
        [9, 900000000, 300000000],
        [4, 800000000, 250000000],
      ] as const) {
        await c.query(
          `INSERT INTO budgeting.budget_wealth_snapshots
             (id, tenant_id, budget_id, captured_at, capitalization_cents,
              investment_value_cents, currency, investment_cost_basis_cents)
           VALUES (gen_random_uuid(), $1, $1, now() - ($2 || ' days')::interval,
                   $3, $4, 'PLN', 100000000)
           ON CONFLICT DO NOTHING`,
          [SOURCE, days, cap, inv],
        );
      }
    } finally {
      c.release();
    }
  }

  test("levels the history onto the values it is GIVEN", async () => {
    await seedSourceHistory();
    // The live values are an input, never derived here. This module twice tried
    // to compute capitalization in SQL and was wrong both times — once by
    // omitting investments, once by valuing holdings at quantity x stored price
    // and ignoring the live price cache. Capitalization has one definition, in
    // compute-budget-wealth-now.
    await inTx((cl) => refreshPair(cl, pairFor(1, { PLN: "USD" })));

    const live = {
      capitalizationCents: 25_000_000n, // $250,000
      investmentValueCents: 10_000_000n, // $100,000
    };
    await inTx((cl) => levelWealthHistory(cl, pairFor(1, {}), live));

    const { rows } = await pool.query(
      `SELECT capitalization_cents::text c, investment_value_cents::text i
         FROM budgeting.budget_wealth_snapshots
        WHERE tenant_id = $1 ORDER BY captured_at DESC LIMIT 1`,
      [DEST],
    );
    expect(rows[0].c).toBe("25000000");
    expect(rows[0].i).toBe("10000000");
  });

  test("is idempotent — re-levelling does not duplicate the series", async () => {
    // It runs in its own transaction after the copy commits, so it can be
    // retried; a second run must replace the series, not append to it.
    const live = {
      capitalizationCents: 25_000_000n,
      investmentValueCents: 10_000_000n,
    };
    await inTx((cl) => levelWealthHistory(cl, pairFor(1, {}), live));
    const first = await pool.query(
      `SELECT count(*)::int n FROM budgeting.budget_wealth_snapshots WHERE tenant_id=$1`,
      [DEST],
    );
    await inTx((cl) => levelWealthHistory(cl, pairFor(1, {}), live));
    const second = await pool.query(
      `SELECT count(*)::int n FROM budgeting.budget_wealth_snapshots WHERE tenant_id=$1`,
      [DEST],
    );
    expect(second.rows[0].n).toBe(first.rows[0].n);
  });

  test("preserves the SHAPE — only the level moves", async () => {
    const { rows } = await pool.query(
      `SELECT s.capitalization_cents::numeric AS src, d.capitalization_cents::numeric AS dst
         FROM budgeting.budget_wealth_snapshots s
         JOIN budgeting.budget_wealth_snapshots d
           ON d.tenant_id = $2
          AND date_trunc('hour', d.captured_at) = date_trunc('hour', s.captured_at)
        WHERE s.tenant_id = $1 ORDER BY s.captured_at`,
      [SOURCE, DEST],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const ratios = rows.map((r) => Number(r.dst) / Number(r.src));
    const first = ratios[0]!;
    for (const r of ratios) {
      expect(Math.abs(r - first) / first).toBeLessThan(0.001);
    }
  });
});

describe("demo readability", () => {
  test("amount privacy is OFF, whatever the owner has set", async () => {
    // The owner runs with amounts obfuscated. Copied through, a prospect lands
    // on a wall of scrambled characters and can evaluate nothing — the demo
    // exists to be read.
    const c = await pool.connect();
    try {
      await c.query(`SET app.tenant_ids = '{${SOURCE},${DEST}}'`);
      await c.query(`SET app.current_user_id = '${OWNER_USER}'`);
      await c.query(
        `UPDATE tenancy.budgets SET amount_privacy_enabled = true WHERE id = $1`,
        [SOURCE],
      );
    } finally {
      c.release();
    }

    await inTx((cl) => refreshPair(cl, pairFor(1, { PLN: "USD" })));

    const { rows } = await pool.query(
      `SELECT amount_privacy_enabled FROM tenancy.budgets WHERE id = $1`,
      [DEST],
    );
    expect(rows[0].amount_privacy_enabled).toBe(false);
  });
});
