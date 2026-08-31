/**
 * copy.ts — rebuilds one demo budget from one source budget.
 *
 * Ordering inside the caller's transaction is load-bearing:
 *
 *   1. preflight   — abort BEFORE touching anything if the schema drifted
 *   2. id map      — mint a destination uuid for every source id
 *   3. wipe        — clear the demo tenant (reverse FK order)
 *   4. copy        — INSERT … SELECT through the manifest rules (FK order)
 *   5. membership  — synthesise the demo user's membership
 *
 * A failure at any step rolls the whole thing back, so a bad night leaves
 * yesterday's demo standing rather than an empty or half-scrubbed one.
 *
 * SAFETY: table and column names come from the manifest — code, never input —
 * and every VALUE is a bound parameter. The one place a caller-supplied string
 * reaches SQL text is the pool literals, which are quoted through `literal()`.
 */
import type { PoolClient } from "pg";
import { demoManifest, DEMO_COPY_ORDER, rowScope } from "./manifest";
import type { TableManifest, ColumnEntry } from "./preflight";
import {
  poolValues,
  merchantsForCategory,
  categoryCount,
  type PoolName,
  type DemoLocale,
} from "./pools";

export type CopyPair = {
  source: string;
  dest: string;
  label: string;
  /** Destination budget's default_currency. */
  currency: string;
  /** e.g. {PLN:"USD"}; {} keeps every source currency. */
  currencyMap: Record<string, string>;
  /** This night's factor for this pair — resolved ONCE, threaded everywhere. */
  moneyScale: number;
  demoUserId: string;
  /** Extra member on a shared demo budget, so the sharing story renders. */
  secondMemberUserId?: string;
  /** Display name for the destination budget. */
  budgetName: string;
  /** Which language the demo's DATA is written in (not just its UI). */
  textLocale: DemoLocale;
};

function ident(qualified: string): string {
  // "schema.table" → "schema"."table". Manifest-sourced, but quote anyway:
  // an unquoted identifier here would be the one injection seam in this file.
  return qualified
    .split(".")
    .map((p) => `"${p.replace(/"/g, '""')}"`)
    .join(".");
}

function col(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function literal(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * SQL that yields a value from a text pool, UNIQUE within the tenant.
 *
 * Uniqueness is not cosmetic. `categories_unique_name_per_tenant` (and the
 * equivalents on wallets and budgets.slug) mean a duplicate name aborts the
 * whole refresh. A hash-of-the-id pick collides as soon as a tenant has more
 * rows than the pool has entries — the owner's 19 categories against 15 pool
 * names, which is exactly how this was found.
 *
 * So the pick walks a per-tenant row ordinal instead, and once it wraps past
 * the end of the pool it appends the lap number: Groceries, … , Groceries 2.
 * Deterministic, collision-free for any row count, and still plausible.
 */
function poolExpr(locale: DemoLocale, pool: PoolName, unique: boolean): string {
  const list = poolValues(locale, pool);
  const values = list.map(literal).join(",");
  const n = list.length;
  const pick = `(ARRAY[${values}])[((src.__rn - 1) % ${n}) + 1]`;
  if (!unique) return pick;
  return (
    `(${pick} || CASE WHEN src.__rn > ${n}` +
    ` THEN ' ' || (((src.__rn - 1) / ${n}) + 1)::text ELSE '' END)`
  );
}

/**
 * A merchant drawn from the row's OWN category vocabulary.
 *
 * Categories are renamed by their per-tenant ordinal, so a row's category
 * ordinal also selects which merchant list it belongs to. The ordinal arrives
 * via the `cat_ord` join; rows with no category fall back to the flat pool.
 *
 * Emitted as a CASE over the category ordinal — generated from the same tables
 * the TypeScript side uses, so the two can never drift apart.
 */
function coherentMerchantExpr(locale: DemoLocale): string {
  const n = categoryCount(locale);
  const branches: string[] = [];
  for (let i = 0; i < n; i++) {
    const list = merchantsForCategory(locale, i);
    const arr = list.map(literal).join(",");
    branches.push(
      `WHEN ${i} THEN (ARRAY[${arr}])[((src.__rn - 1) % ${list.length}) + 1]`,
    );
  }
  const flat = poolValues(locale, "merchant");
  const fallback = `(ARRAY[${flat.map(literal).join(",")}])[((src.__rn - 1) % ${flat.length}) + 1]`;
  return `CASE (cat_ord.ord % ${n}) ${branches.join(" ")} ELSE ${fallback} END`;
}

/**
 * Rounds a scaled money value to something a person would have typed.
 * Mirrors niceRound() in rules.ts; the unit test pins the two together.
 */
function niceRoundSql(scaledMajor: string): string {
  return (
    `(CASE` +
    ` WHEN abs(${scaledMajor}) < 20 THEN round(${scaledMajor})` +
    ` WHEN abs(${scaledMajor}) < 100 THEN round(${scaledMajor} / 5) * 5` +
    ` WHEN abs(${scaledMajor}) < 1000 THEN round(${scaledMajor} / 10) * 10` +
    ` WHEN abs(${scaledMajor}) < 10000 THEN round(${scaledMajor} / 50) * 50` +
    ` WHEN abs(${scaledMajor}) < 100000 THEN round(${scaledMajor} / 500) * 500` +
    ` ELSE round(${scaledMajor} / 1000) * 1000 END)`
  );
}

/**
 * Binds values lazily and returns their placeholders.
 *
 * Parameters cannot be pre-assigned fixed indices: a table with no money and no
 * currency column would then supply five parameters to a statement referencing
 * three, and Postgres rejects that outright. Each value is bound the first time
 * a column actually needs it.
 */
function makeBinder(values: unknown[]) {
  const seen = new Map<string, string>();
  return (key: string, value: unknown, cast: string): string => {
    const hit = seen.get(key);
    if (hit) return hit;
    values.push(value);
    const placeholder = `$${values.length}${cast}`;
    seen.set(key, placeholder);
    return placeholder;
  };
}

type Binder = ReturnType<typeof makeBinder>;

/**
 * The SQL expression that produces one destination column from a source row.
 * Returns null for columns that must be omitted from the INSERT entirely.
 */
function columnExpr(
  rule: ColumnEntry,
  name: string,
  pair: CopyPair,
  bind: Binder,
): string | null {
  switch (rule.kind) {
    case "GENERATED":
      return null; // the database computes it
    case "COPY":
      return `src.${col(name)}`;
    case "TENANT":
      return bind("dest", pair.dest, "::uuid");
    case "OWNER":
      return bind("owner", pair.demoUserId, "::uuid");
    case "NULL":
      return `NULL`;
    case "SCALE_MONEY": {
      const s = bind("scale", String(pair.moneyScale), "::numeric");
      const scaled = `(src.${col(name)}::numeric * ${s})`;
      if (rule.round === "nice") {
        // Round in MAJOR units (what the user sees), then return to the
        // column's own scale.
        const major = rule.decimals === 0 ? `(${scaled} / 100)` : `${scaled}`;
        const rounded = niceRoundSql(major);
        return rule.decimals === 0
          ? `(${rounded} * 100)::bigint`
          : `round(${rounded}, 4)`;
      }
      return rule.decimals === 0
        ? `round(${scaled})::bigint`
        : `round(${scaled}, 4)`;
    }
    case "RELABEL_CURRENCY": {
      // Unmapped codes pass through unchanged — that is how the family pair
      // keeps PLN while the personal pair relabels it.
      const m = bind("ccy", JSON.stringify(pair.currencyMap), "::jsonb");
      return `coalesce(${m} ->> upper(src.${col(name)}::text), src.${col(name)}::text)`;
    }
    case "FAKE_TEXT": {
      const text = rule.coherentWithCategory
        ? coherentMerchantExpr(pair.textLocale)
        : poolExpr(pair.textLocale, rule.pool, rule.unique === true);
      return `CASE WHEN src.${col(name)} IS NULL THEN NULL ELSE ${text} END`;
    }
    case "REMAP_ID":
      return `(SELECT m.dst FROM demo_idmap m WHERE m.src = src.${col(name)})`;
  }
}

function byTable(table: string): TableManifest {
  const t = demoManifest.find((x) => x.table === table);
  if (!t) throw new Error(`demo manifest: no entry for ${table}`);
  return t;
}

/**
 * Step 2. Mint a destination uuid for every source uuid the copy will need.
 *
 * One GLOBAL map keyed by the source uuid, not one map per table: uuids are
 * unique across tables, so a single map lets every foreign key resolve with the
 * same lookup — including `transfer_group_id`, which is a shared id with no
 * table of its own.
 */
async function buildIdMap(client: PoolClient, pair: CopyPair): Promise<void> {
  // Dropped first: both pairs are refreshed inside ONE transaction, so the
  // second pair would otherwise collide with the first pair's map — and must
  // not inherit its entries either, or ids would resolve across budgets.
  await client.query(`DROP TABLE IF EXISTS demo_idmap`);
  await client.query(
    `CREATE TEMP TABLE demo_idmap (src uuid PRIMARY KEY, dst uuid NOT NULL) ON COMMIT DROP`,
  );
  // The destination budget keeps its configured id across nights, so bookmarks
  // and the demo user's membership survive a refresh.
  await client.query(`INSERT INTO demo_idmap (src, dst) VALUES ($1, $2)`, [
    pair.source,
    pair.dest,
  ]);

  for (const table of DEMO_COPY_ORDER) {
    const t = byTable(table);
    if (t.mode !== "copy" || t.table === "tenancy.budgets") continue;
    const scope = rowScope(t);
    const scopeValue = scope.kind === "tenant" ? pair.source : pair.source;

    for (const [name, rule] of Object.entries(t.columns)) {
      if (rule.kind !== "REMAP_ID") continue;
      await client.query(
        `INSERT INTO demo_idmap (src, dst)
         SELECT DISTINCT s.${col(name)}, gen_random_uuid()
           FROM ${ident(t.table)} s
          WHERE s.${col(scope.column)} = $1 AND s.${col(name)} IS NOT NULL
         ON CONFLICT (src) DO NOTHING`,
        [scopeValue],
      );
    }
  }
}

/** Step 3. Clear the demo tenant, reverse FK order. */
export async function wipeDemoTenant(
  client: PoolClient,
  destTenantId: string,
): Promise<void> {
  for (const table of [...DEMO_COPY_ORDER].reverse()) {
    const t = byTable(table);
    // The destination budget ROW itself is never deleted: its id is configured
    // and stable, and everything else FKs to it. It is updated in place.
    if (t.table === "tenancy.budgets") continue;
    if (t.mode === "leave") continue;
    const scope = rowScope(t);
    await client.query(
      `DELETE FROM ${ident(t.table)} WHERE ${col(scope.column)} = $1`,
      [destTenantId],
    );
  }
}

/** Which columns this deployment actually has, per table. */
async function liveColumns(
  client: PoolClient,
): Promise<Map<string, Set<string>>> {
  const { rows } = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(
    `SELECT table_schema, table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = ANY($1::text[])`,
    [["budgeting", "tenancy", "shared_kernel"]],
  );
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = `${r.table_schema}.${r.table_name}`;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(r.column_name);
  }
  return m;
}

/** Step 4 + 5. */
export async function copyIntoDemoTenant(
  client: PoolClient,
  pair: CopyPair,
  live: Map<string, Set<string>>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const table of DEMO_COPY_ORDER) {
    const t = byTable(table);
    if (t.mode !== "copy") continue;

    if (t.table === "budgeting.budget_wealth_snapshots") {
      await copyWealthHistory(client, pair);
      counts[t.table] = 1;
      continue;
    }

    if (t.table === "tenancy.budgets") {
      // One row, handled explicitly rather than bent through the generic
      // engine: it is an UPDATE (stable id) and its name/currency come from the
      // pair, not from the source.
      await client.query(
        `UPDATE tenancy.budgets d
            SET name = $2,
                default_currency = $3,
                kind = s.kind,
                member_count = $4,
                timezone = s.timezone,
                cushion_mode_enabled = s.cushion_mode_enabled,
                reserves_enabled = s.reserves_enabled,
                cushion_enabled = s.cushion_enabled,
                cushion_target_months = s.cushion_target_months,
                investments_enabled = s.investments_enabled,
                amount_privacy_enabled = s.amount_privacy_enabled,
                archived_at = NULL
           FROM tenancy.budgets s
          WHERE d.id = $1 AND s.id = $5`,
        [
          pair.dest,
          pair.budgetName,
          pair.currency,
          pair.secondMemberUserId ? 2 : 1,
          pair.source,
        ],
      );
      counts[t.table] = 1;
      continue;
    }

    const scope = rowScope(t);
    const names: string[] = [];
    const exprs: string[] = [];
    const values: unknown[] = [pair.source]; // $1 is always the source scope
    const bind = makeBinder(values);
    // Stable ordering for the row ordinal the text pool walks. `id` when the
    // table has one; otherwise the scope column, which is constant across the
    // set — row_number() still yields distinct values, which is all uniqueness
    // needs.
    const orderBy = "id" in t.columns ? `s."id"` : `s.${col(scope.column)}`;

    for (const [name, rule] of Object.entries(t.columns)) {
      // An `optional` column is one this deployment may not have (hand-applied
      // DDL that never became a migration). Naming it in the INSERT would make
      // the whole refresh fail on the deployments that lack it.
      if (rule.optional && !live.get(t.table)?.has(name)) continue;
      const expr = columnExpr(rule, name, pair, bind);
      if (expr === null) continue;
      names.push(col(name));
      exprs.push(expr);
    }

    // Only joined when a column actually needs it. `cat_ord` numbers the
    // source tenant's categories the SAME way the categories copy does, so a
    // row's category ordinal here selects the very vocabulary its category was
    // renamed from — that is what keeps a Groceries note about groceries.
    const needsCategoryOrdinal = Object.values(t.columns).some(
      (r) => r.kind === "FAKE_TEXT" && r.coherentWithCategory,
    );
    const catOrdJoin = needsCategoryOrdinal
      ? ` LEFT JOIN (
            SELECT id, (row_number() OVER (ORDER BY id) - 1) AS ord
              FROM budgeting.categories WHERE tenant_id = $1
          ) cat_ord ON cat_ord.id = src.category_id`
      : "";

    const res = await client.query(
      `INSERT INTO ${ident(t.table)} (${names.join(", ")})
       SELECT ${exprs.join(", ")}
         FROM (
           SELECT s.*, row_number() OVER (ORDER BY ${orderBy}) AS __rn
             FROM ${ident(t.table)} s
            WHERE s.${col(scope.column)} = $1
         ) src${catOrdJoin}`,
      values,
    );
    counts[t.table] = res.rowCount ?? 0;
  }

  await synthesiseMembership(client, pair);
  return counts;
}

/**
 * The money factor that lands this budget's capitalization ON its anchor.
 *
 * Everything the demo shows is LINEAR in the factor — wallet balances scale by
 * it, investment quantities scale by it, prices do not — so capitalization at
 * factor F is exactly F × capitalization at factor 1. That makes the factor
 * solvable in closed form rather than by trial: F = anchor ÷ cap(1).
 *
 * Recomputed every night, which is the whole point of anchoring: as the owner's
 * real balances move, the factor absorbs the movement and the demo stays put.
 * A fixed factor could not do that — the demo's level would drift with the
 * owner's, and its magnitude would stay proportional to theirs. Here the level
 * is a number WE chose, with no arithmetic relationship to the owner's at all.
 *
 * `cap(1)` is computed from the SOURCE with the same relabel-and-convert rules
 * the copy is about to apply, so the prediction matches what actually lands.
 *
 * NO artificial wobble. An earlier version added ±3% "so it looks alive",
 * which was a mistake: that noise lands squarely in the card's "since
 * yesterday" figure, inventing a ±6% day-over-day move out of nothing — the
 * exact complaint anchoring is meant to answer. The demo is already alive
 * without it, because the owner's real day-to-day movement flows through the
 * copied history (currently a fraction of a percent, as it should be).
 */
export async function anchorScale(
  client: PoolClient,
  pair: CopyPair,
  anchor: number,
): Promise<number> {
  // Announce both tenants FIRST. This runs before refreshPair (its result IS
  // refreshPair's input), so without this the source is invisible under RLS,
  // every sum comes back 0, and the anchor silently degrades to the fallback
  // factor of 1 — which looks like it worked.
  await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
    `{${pair.source},${pair.dest}}`,
  ]);
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
    pair.demoUserId,
  ]);

  const { rows } = await client.query<{ cap: string | null }>(
    `WITH fx AS (
       SELECT base, quote, rate FROM budgeting.fx_rates
        WHERE date = (SELECT max(date) FROM budgeting.fx_rates)
     ),
     -- The copy relabels currencies (PLN->USD is a rename, not a conversion),
     -- so the rate lookup must use the RELABELED code to predict correctly.
     w AS (
       SELECT COALESCE(sum(
         wa.current_balance * CASE
           WHEN COALESCE($3::jsonb ->> upper(wa.currency), upper(wa.currency)) = $2 THEN 1
           ELSE COALESCE((SELECT rate FROM fx WHERE base = COALESCE($3::jsonb ->> upper(wa.currency), upper(wa.currency)) AND quote = $2), 1)
         END), 0) AS v
         FROM budgeting.wallets wa
        WHERE wa.tenant_id = $1 AND wa.archived_at IS NULL
     ),
     i AS (
       SELECT COALESCE(sum(
         inv.quantity * (inv.current_price_cents / 100.0) * CASE
           WHEN COALESCE($3::jsonb ->> upper(inv.current_price_currency), upper(inv.current_price_currency)) = $2 THEN 1
           ELSE COALESCE((SELECT rate FROM fx WHERE base = COALESCE($3::jsonb ->> upper(inv.current_price_currency), upper(inv.current_price_currency)) AND quote = $2), 1)
         END), 0) AS v
         FROM budgeting.investments inv
        WHERE inv.tenant_id = $1 AND inv.archived_at IS NULL
     )
     SELECT ((SELECT v FROM w) + (SELECT v FROM i))::text AS cap`,
    [pair.source, pair.currency, JSON.stringify(pair.currencyMap)],
  );

  const capAtOne = Number(rows[0]?.cap ?? 0);
  // No source data (or no rates) → copy the source unchanged rather than
  // divide by zero and publish a nonsense level.
  if (!Number.isFinite(capAtOne) || capAtOne <= 0) return 1;

  return anchor / capAtOne;
}

/**
 * Wealth history, re-levelled onto the demo's OWN present value.
 *
 * `budget_wealth_snapshots` stores totals ALREADY CONVERTED into the source
 * budget's currency. Relabeling PLN→USD — right for a wallet, whose balance is
 * just a number wearing a currency — silently redenominates those totals
 * without converting them, so the copied history sat far above the demo's live
 * value and the Overview reported a crash that never happened.
 *
 * So each series is scaled by (its own live value ÷ its newest source point).
 * The money factor cancels out of that ratio, which is why this is exact.
 *
 * CAPITALIZATION IS WALLETS **PLUS INVESTMENTS** (see
 * compute-budget-wealth-now: "Σ ALL wallet balances + investments"). An earlier
 * version of this used wallets alone, which left the newest history point ~45%
 * BELOW the capitalization card — the very discontinuity this function exists
 * to remove. Investments are ~95% of the source household's net worth, so the
 * omission was not a rounding matter.
 *
 * Capitalization and investment value get SEPARATE ratios. Riding one ratio for
 * both would keep their proportion but put the investment series at the wrong
 * level, and the Overview draws them on the same axis.
 *
 * Runs AFTER wallets and investments are copied — the live values come from
 * them — and as an INSERT rather than a follow-up UPDATE, because app_role
 * holds no UPDATE on this append-only table.
 */
async function copyWealthHistory(
  client: PoolClient,
  pair: CopyPair,
): Promise<void> {
  await client.query(
    `WITH fx AS (
       SELECT base, quote, rate FROM budgeting.fx_rates
        WHERE date = (SELECT max(date) FROM budgeting.fx_rates)
     ),
     live_wallets AS (
       SELECT COALESCE(sum(
         w.current_balance * CASE
           WHEN w.currency = $3 THEN 1
           ELSE COALESCE((SELECT rate FROM fx
                           WHERE base = w.currency AND quote = $3), 1)
         END), 0) AS v
         FROM budgeting.wallets w
        WHERE w.tenant_id = $2 AND w.archived_at IS NULL
     ),
     live_investments AS (
       SELECT COALESCE(sum(
         i.quantity * (i.current_price_cents / 100.0) * CASE
           WHEN i.current_price_currency = $3 THEN 1
           ELSE COALESCE((SELECT rate FROM fx
                           WHERE base = i.current_price_currency
                             AND quote = $3), 1)
         END), 0) AS v
         FROM budgeting.investments i
        WHERE i.tenant_id = $2 AND i.archived_at IS NULL
     ),
     newest AS (
       SELECT capitalization_cents AS cap, investment_value_cents AS inv
         FROM budgeting.budget_wealth_snapshots
        WHERE tenant_id = $1
        ORDER BY captured_at DESC LIMIT 1
     ),
     r AS (
       SELECT
         COALESCE(
           ((SELECT v FROM live_wallets) + (SELECT v FROM live_investments))
             * 100 / NULLIF(newest.cap, 0), 0) AS cap_ratio,
         COALESCE(
           (SELECT v FROM live_investments) * 100 / NULLIF(newest.inv, 0),
           0) AS inv_ratio
         FROM newest
     )
     INSERT INTO budgeting.budget_wealth_snapshots
       (id, tenant_id, budget_id, captured_at, capitalization_cents,
        investment_value_cents, currency, investment_cost_basis_cents)
     SELECT gen_random_uuid(), $2::uuid, $2::uuid, s.captured_at,
            round(s.capitalization_cents * r.cap_ratio)::bigint,
            round(s.investment_value_cents * r.inv_ratio)::bigint,
            $3,
            round(COALESCE(s.investment_cost_basis_cents, 0) * r.inv_ratio)::bigint
       FROM budgeting.budget_wealth_snapshots s, r
      WHERE s.tenant_id = $1 AND r.cap_ratio > 0`,
    [pair.source, pair.dest, pair.currency],
  );
}

/**
 * Step 5. The demo user's membership is created here, not copied.
 *
 * This is also the isolation invariant in its constructive form: the demo user
 * gets budget_members rows for the demo budgets and NOTHING else, and RLS
 * derives app.tenant_ids from exactly these rows. 12-03 pins it from outside.
 */
async function synthesiseMembership(
  client: PoolClient,
  pair: CopyPair,
): Promise<void> {
  await client.query(
    `INSERT INTO tenancy.budget_members
       (id, budget_id, user_id, role, created_at, ownership_share_pct, include_in_aggregation)
     VALUES (gen_random_uuid(), $1, $2, 'owner', now(), 100, true)`,
    [pair.dest, pair.demoUserId],
  );

  if (pair.secondMemberUserId) {
    await client.query(
      `INSERT INTO tenancy.budget_members
         (id, budget_id, user_id, role, created_at, ownership_share_pct, include_in_aggregation)
       VALUES (gen_random_uuid(), $1, $2, 'member', now(), 100, true)`,
      [pair.dest, pair.secondMemberUserId],
    );
  }
}

/**
 * Rebuilds one demo budget. The CALLER owns the transaction — that is what
 * makes "a failed night keeps yesterday's demo" true.
 */
export async function refreshPair(
  client: PoolClient,
  pair: CopyPair,
): Promise<Record<string, number>> {
  // Both tenants visible for the duration of this transaction only. SET LOCAL
  // dies with the transaction, and this is the sole code path that ever sees
  // the owner's tenant alongside the demo's.
  // set_config(..., is_local => true), not `SET LOCAL`: the latter is not a
  // parameterisable statement, and interpolating tenant ids into SQL text is
  // exactly the seam this code must not have.
  await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
    `{${pair.source},${pair.dest}}`,
  ]);
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
    pair.demoUserId,
  ]);

  const live = await liveColumns(client);
  await buildIdMap(client, pair);
  await wipeDemoTenant(client, pair.dest);
  return copyIntoDemoTenant(client, pair, live);
}
