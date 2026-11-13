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
  localePools,
  conceptForName,
  type PoolName,
  type DemoLocale,
} from "./pools";

export type CopyPair = {
  source: string;
  dest: string;
  label: string;
  /** Destination budget's default_currency. */
  currency: string;
  /** The source budgets' own currency (DEMO_HOME_CURRENCY). */
  home: string;
  /** e.g. {PLN:"USD"}; {} keeps every source currency. */
  currencyMap: Record<string, string>;
  /**
   * Rate per RELABELLED source currency into the code it becomes, e.g.
   * {PLN: 0.27} for PLN→USD. A relabel without its rate made the family
   * budget ~9× too expensive and the hryvnia one ~9× too cheap (261113).
   */
  fxMultipliers: Record<string, number>;
  /** Everything that is not wealth: spendings, limits, incomes… (0.8–1.2). */
  flowScale: number;
  /** Wallets and investments (0.1–5). Resolved ONCE per pair. */
  wealthScale: number;
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
function coherentMerchantExpr(locale: DemoLocale, ranked: boolean): string {
  const n = categoryCount(locale);
  // The concept the row's category was NAMED from (buildNameMap), so the note
  // and the category it sits in mean the same thing.
  const concept = `(SELECT n.concept FROM demo_names n WHERE n.src = src.category_id AND n.field = 'name')`;
  const branches: string[] = [];
  for (let i = 0; i < n; i++) {
    const list = merchantsForCategory(locale, i);
    const arr = list.map(literal).join(",");
    const pick = ranked
      ? `least(${list.length - 1}, floor(src.__pr * ${list.length}))::int + 1`
      : `((src.__rn - 1) % ${list.length}) + 1`;
    branches.push(`WHEN ${i} THEN (ARRAY[${arr}])[${pick}]`);
  }
  const flat = poolValues(locale, "merchant");
  const fallback = `(ARRAY[${flat.map(literal).join(",")}])[((src.__rn - 1) % ${flat.length}) + 1]`;
  return `CASE (${concept} % ${n}) ${branches.join(" ")} ELSE ${fallback} END`;
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
      const factor = rule.alt
        ? `(CASE WHEN ${rule.alt.when} THEN ${factorSql(rule.alt.basis, pair, bind)} ELSE ${factorSql(rule.basis, pair, bind)} END)`
        : factorSql(rule.basis, pair, bind);
      const scaled = `(src.${col(name)}::numeric * ${rateSql(rule.ccy, pair, bind)} * ${factor})`;
      if (rule.round === "nice") {
        // Round in MAJOR units (what the user sees), then return to the
        // column's own scale.
        const major = rule.decimals === 0 ? `(${scaled} / 100)` : `${scaled}`;
        const rounded = niceRoundSql(major);
        return rule.decimals === 0
          ? `(${rounded} * 100)::bigint`
          : `round(${rounded}, ${rule.decimals})`;
      }
      return rule.decimals === 0
        ? `round(${scaled})::bigint`
        : `round(${scaled}, ${rule.decimals})`;
    }
    case "RATE":
      // Both amounts were converted by their own currency's rate; the factor
      // is common to both and cancels.
      return `round(src.${col(name)}::numeric * ${rateSql(rule.to, pair, bind)} / ${rateSql(rule.from, pair, bind)}, 8)`;
    case "MAPPED_TEXT":
      return `(SELECT n.name FROM demo_names n WHERE n.src = src.id AND n.field = ${literal(rule.field)})`;
    case "SIGNED_TEXT":
      return `CASE WHEN src.${col(rule.column)} < 0 THEN ${poolExpr(pair.textLocale, rule.neg, false)} ELSE ${poolExpr(pair.textLocale, rule.pos, false)} END`;
    case "RELABEL_CURRENCY": {
      // Unmapped codes pass through unchanged — that is how the family pair
      // keeps PLN while the personal pair relabels it.
      const m = bind("ccy", JSON.stringify(pair.currencyMap), "::jsonb");
      return `coalesce(${m} ->> upper(src.${col(name)}::text), src.${col(name)}::text)`;
    }
    case "FAKE_TEXT": {
      const text = rule.coherentWithCategory
        ? coherentMerchantExpr(pair.textLocale, rule.rankBy !== undefined)
        : poolExpr(pair.textLocale, rule.pool, rule.unique === true);
      if (rule.fillNull) return text;
      return `CASE WHEN src.${col(name)} IS NULL THEN NULL ELSE ${text} END`;
    }
    case "REMAP_ID":
      return `(SELECT m.dst FROM demo_idmap m WHERE m.src = src.${col(name)})`;
  }
}

/** The pair's factor for a basis, as a bound parameter. */
function factorSql(
  basis: "flow" | "wealth" | "none",
  pair: CopyPair,
  bind: Binder,
): string {
  if (basis === "none") return "1";
  return basis === "flow"
    ? bind("flow", String(pair.flowScale), "::numeric")
    : bind("wealth", String(pair.wealthScale), "::numeric");
}

/**
 * The rate an amount in `ccy` (SQL for its SOURCE currency) is converted by:
 * the pair's rate when that currency is relabelled, else 1 — a EUR wallet in
 * a USD demo stays euros, worth what it is worth.
 */
function rateSql(
  ccy: string | undefined,
  pair: CopyPair,
  bind: Binder,
): string {
  if (!ccy) return "1";
  const fx = bind("fx", JSON.stringify(pair.fxMultipliers), "::jsonb");
  const c = ccy
    .replaceAll("'$HOME'", literal(pair.home))
    .replaceAll("$HOME", literal(pair.home));
  return `coalesce((${fx} ->> upper((${c})::text))::numeric, 1)`;
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
      // Levelled AFTER the copy commits, by levelWealthHistory — it needs the
      // app's own valuation of the copied data, which reads committed rows.
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
                -- Forced OFF, never copied. The owner runs with amounts
                -- obfuscated; a prospect landing on a wall of scrambled
                -- characters sees nothing worth evaluating. The demo exists to
                -- be read.
                amount_privacy_enabled = false,
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

    // Where a note is picked by size: the row's rank within its category.
    const rankBy = Object.values(t.columns).find(
      (r) => r.kind === "FAKE_TEXT" && r.rankBy,
    ) as { rankBy?: string } | undefined;
    const rank = rankBy?.rankBy
      ? `, percent_rank() OVER (PARTITION BY s.category_id ORDER BY abs(s.${col(rankBy.rankBy)}::numeric) DESC) AS __pr`
      : "";
    const res = await client.query(
      `INSERT INTO ${ident(t.table)} (${names.join(", ")})
       SELECT ${exprs.join(", ")}
         FROM (
           SELECT s.*, row_number() OVER (ORDER BY ${orderBy}) AS __rn${rank}
             FROM ${ident(t.table)} s
            WHERE s.${col(scope.column)} = $1
         ) src`,
      values,
    );
    counts[t.table] = res.rowCount ?? 0;
  }

  await fixUps(client, pair);
  await synthesiseMembership(client, pair);
  return counts;
}

const QUANTITY_UI_TYPES = `('stocks','crypto','precious_metals','collectibles')`;
const COUNT_UI_TYPES = `('precious_metals','collectibles')`;

/**
 * What a column rule cannot say, because it spans columns or rows.
 *
 * 1. Needs + wants = the limit. Each was rounded on its own and 10 of 93
 *    stopped adding up (261113).
 * 2. A one-unit asset (broker, cash, bond — value in the price, quantity 1)
 *    stays one unit: its scaled quantity moves into its prices.
 * 3. Coins are whole: the scaled count is rounded (at least 1) and the
 *    holding's entries follow by the same ratio.
 * 4. A single purchase of several coins becomes staged purchases — same
 *    coins, same total cost — so the asset has a history to open.
 * 5. A payment a scheduled payment made carries that payment's name: the two
 *    notes are drawn in separate copies and could disagree.
 * 6. The old Investments spendings category (a feature removed in 15-18) stays
 *    in the owner's budget as a plain one; the demo leaves it out with every
 *    row filed under it (user, 261113). Investments live on the Wallets tab.
 */
async function fixUps(client: PoolClient, pair: CopyPair): Promise<void> {
  const dropped = (
    await client.query<{ dst: string }>(
      `SELECT m.dst FROM budgeting.categories c JOIN demo_idmap m ON m.src = c.id
        WHERE c.tenant_id = $1
          AND lower(trim(c.name)) IN ('investments', 'investment', 'inwestycje', 'інвестиції')`,
      [pair.source],
    )
  ).rows.map((r) => r.dst);
  if (dropped.length > 0) {
    await client.query(
      `DELETE FROM budgeting.reserve_fit_exclusions WHERE ledger_id IN
         (SELECT id FROM budgeting.expense_ledger WHERE category_id = ANY($1::uuid[]))`,
      [dropped],
    );
    // Children before the category; the ledger before the scheduled payments
    // its rows point at.
    for (const t of [
      "budgeting.expense_ledger",
      ...DEMO_COPY_ORDER.filter(
        (n) =>
          n !== "budgeting.expense_ledger" &&
          byTable(n).mode === "copy" &&
          "category_id" in byTable(n).columns,
      ),
    ]) {
      await client.query(
        `DELETE FROM ${ident(t)} WHERE category_id = ANY($1::uuid[])`,
        [dropped],
      );
    }
    await client.query(
      `DELETE FROM budgeting.categories WHERE id = ANY($1::uuid[])`,
      [dropped],
    );
  }
  await client.query(
    `UPDATE budgeting.expense_ledger l SET note = s.note
       FROM budgeting.scheduled_payments s
      WHERE l.tenant_id = $1 AND s.id = l.scheduled_payment_id
        AND s.note IS NOT NULL AND l.note IS DISTINCT FROM s.note`,
    [pair.dest],
  );
  await client.query(
    `UPDATE budgeting.category_limits
        SET wants_amount = normal_amount - needs_amount
      WHERE tenant_id = $1 AND wants_amount IS NOT NULL
        AND needs_amount IS NOT NULL AND normal_amount >= needs_amount`,
    [pair.dest],
  );
  await client.query(
    `UPDATE budgeting.investments
        SET current_price_cents = current_price_cents * quantity,
            buy_price_cents = round(buy_price_cents * quantity)::bigint,
            quantity = 1
      WHERE tenant_id = $1 AND ui_type NOT IN ${QUANTITY_UI_TYPES}
        AND quantity = round($2::numeric, 8) AND quantity <> 1`,
    [pair.dest, String(pair.wealthScale)],
  );
  const ratio = `h.nq / h.q`;
  await client.query(
    `WITH h AS (
       SELECT id, quantity AS q, greatest(1, round(quantity)) AS nq
         FROM budgeting.investments
        WHERE tenant_id = $1 AND ui_type IN ${COUNT_UI_TYPES}
          AND quantity > 0 AND quantity <> greatest(1, round(quantity))
     )
     UPDATE budgeting.investment_history x
        SET qty_delta = round(x.qty_delta * ${ratio}),
            amount_cents = round(x.amount_cents * ${ratio})::bigint,
            cost_delta_cents = round(x.cost_delta_cents * ${ratio})::bigint,
            flow_cents = round(x.flow_cents * ${ratio})::bigint,
            value_delta_cents = round(x.value_delta_cents * ${ratio})::bigint,
            asset_amount_cents = round(x.asset_amount_cents * ${ratio})::bigint,
            sold_cost_budget_cents = round(x.sold_cost_budget_cents * ${ratio})::bigint,
            realized_budget_cents = round(x.realized_budget_cents * ${ratio})::bigint
       FROM h WHERE x.holding_id = h.id`,
    [pair.dest],
  );
  await client.query(
    `UPDATE budgeting.investments SET quantity = greatest(1, round(quantity))
      WHERE tenant_id = $1 AND ui_type IN ${COUNT_UI_TYPES} AND quantity > 0`,
    [pair.dest],
  );
  await stagePurchases(client, pair);
}

/** Unit-cost ramp of staged purchases: older coins were cheaper. */
const STAGE_WEIGHTS = [0.94, 1, 1.06];
const STAGE_MONTHS = 7;

async function stagePurchases(client: PoolClient, pair: CopyPair) {
  const { rows } = await client.query<{
    id: string;
    d: string;
    qty: string;
    cost: string;
  }>(
    `SELECT x.id, x.effective_date::text AS d, x.qty_delta::text AS qty,
            x.cost_delta_cents::text AS cost
       FROM budgeting.investment_history x
       JOIN budgeting.investments i ON i.id = x.holding_id
      WHERE x.tenant_id = $1 AND i.ui_type IN ${COUNT_UI_TYPES}
        AND x.kind = 'start' AND x.deleted_at IS NULL AND x.qty_delta >= 2
        AND NOT EXISTS (SELECT 1 FROM budgeting.investment_history y
                         WHERE y.holding_id = x.holding_id AND y.id <> x.id
                           AND y.deleted_at IS NULL)`,
    [pair.dest],
  );
  for (const r of rows) {
    const plan = stagePlan(Number(r.qty), BigInt(r.cost), r.d, new Date());
    if (plan.length < 2) continue;
    const [first, ...rest] = plan;
    await client.query(
      `UPDATE budgeting.investment_history
          SET qty_delta = $2, amount_cents = $3, cost_delta_cents = $3, flow_cents = $3
        WHERE id = $1`,
      [r.id, first!.qty, first!.cost.toString()],
    );
    for (const [k, p] of rest.entries()) {
      await client.query(
        `INSERT INTO budgeting.investment_history
           (id, tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency,
            qty_delta, cost_delta_cents, cost_currency, flow_cents, flow_currency, value_delta_cents,
            asset_amount_cents, created_at)
         SELECT gen_random_uuid(), tenant_id, budget_id, holding_id, 'buy', $2::date, $3, amount_currency,
                $4, $3, cost_currency, $3, flow_currency, 0, $3, created_at + ($5 || ' minutes')::interval
           FROM budgeting.investment_history WHERE id = $1`,
        [r.id, p.date, p.cost.toString(), p.qty, String(k + 1)],
      );
    }
  }
}

/**
 * Splits `qty` whole coins bought on `start` for `cost` into up to three
 * purchases, STAGE_MONTHS apart and never later than a week ago. Quantities
 * and costs sum exactly to the originals.
 */
export function stagePlan(
  qty: number,
  cost: bigint,
  start: string,
  today: Date,
): Array<{ date: string; qty: number; cost: bigint }> {
  const limit = new Date(today.getTime() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const dates = [start];
  for (let k = 1; k < Math.min(qty, STAGE_WEIGHTS.length); k++) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + STAGE_MONTHS * k);
    const iso = d.toISOString().slice(0, 10);
    if (iso > limit) break;
    dates.push(iso);
  }
  const n = dates.length;
  const qtys = dates.map((_, i) => Math.floor(qty / n) + (i < qty % n ? 1 : 0));
  const weights = qtys.map((q, i) => q * STAGE_WEIGHTS[i]!);
  const total = weights.reduce((a, b) => a + b, 0);
  let left = cost;
  return dates.map((date, i) => {
    const c =
      i === n - 1
        ? left
        : BigInt(Math.round((Number(cost) * weights[i]!) / total));
    left -= c;
    return { date, qty: qtys[i]!, cost: c };
  });
}

/**
 * Step 2b. A name for every row whose name has to fit what the row IS
 * (261113, user: "check sense of naming… in some places they are
 * ridiculous"). Worked out here, in code, from the SOURCE rows, and read by
 * MAPPED_TEXT / coherent notes through the `demo_names` temp table.
 *
 *   categories   by the meaning of the source name (House → Housing)
 *   wallets      by wallet type, never repeated
 *   investments  by type: "BTC – Exchange", "Krugerrand 1 oz", "Brokerage
 *                Account", "Savings USD"; groups by type
 *   incomes      by cadence and size: the biggest monthly one is the salary
 *
 * Only the source's SHAPE is read (a category name to classify, a type, a
 * ticker); no source text is written anywhere.
 */
async function buildNameMap(client: PoolClient, pair: CopyPair): Promise<void> {
  await client.query(`DROP TABLE IF EXISTS demo_names`);
  await client.query(
    `CREATE TEMP TABLE demo_names (src uuid, field text, name text, concept int,
       PRIMARY KEY (src, field)) ON COMMIT DROP`,
  );
  const P = localePools(pair.textLocale);
  const out: Array<[string, string, string, number | null]> = [];

  // Categories. Live ones claim their concept first.
  const cats = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM budgeting.categories WHERE tenant_id = $1
      ORDER BY archived_at NULLS FIRST, sort_index, id`,
    [pair.source],
  );
  const used = new Set<number>();
  const wanted = cats.rows.map((c) => {
    const k = conceptForName(c.name);
    if (k === null || used.has(k)) return null;
    used.add(k);
    return k;
  });
  let next = 0;
  let lap = 0;
  cats.rows.forEach((c, i) => {
    let k = wanted[i];
    let suffix = "";
    if (k === null || k === undefined) {
      while (used.has(next) && next < P.category.length) next++;
      if (next >= P.category.length) {
        // More categories than concepts: lap the list, numbered.
        k = lap % P.category.length;
        suffix = ` ${Math.floor(lap / P.category.length) + 2}`;
        lap++;
      } else {
        k = next;
        used.add(k);
      }
    }
    out.push([c.id, "name", `${P.category[k]}${suffix}`, k]);
  });

  // Wallets, per type.
  const wallets = await client.query<{ id: string; t: string; ccy: string }>(
    `SELECT id, wallet_type::text AS t, currency::text AS ccy FROM budgeting.wallets
      WHERE tenant_id = $1 ORDER BY archived_at NULLS FIRST, sort_order, id`,
    [pair.source],
  );
  const perType = new Map<string, number>();
  const walletNames = new Set<string>();
  for (const w of wallets.rows) {
    const key = `wallet${w.t}` as keyof typeof P;
    const list = (Array.isArray(P[key]) ? P[key] : P.walletOTHER) as string[];
    const k = perType.get(key) ?? 0;
    perType.set(key, k + 1);
    // Past the end of the list, the currency tells two apart ("Emergency
    // Fund CHF") before a number has to.
    const base = list[k % list.length]!;
    const ccy = pair.currencyMap[w.ccy] ?? w.ccy;
    let name = k < list.length ? base : `${base} ${ccy}`;
    for (let n = 2; walletNames.has(name); n++) name = `${base} ${n}`;
    walletNames.add(name);
    out.push([w.id, "name", name, null]);
  }

  // Investments, per type; tracked/ticked ones by ticker and where it is held.
  const holdings = await client.query<{
    id: string;
    ui: string | null;
    grp: string | null;
    ccy: string | null;
    ticker: string | null;
    display: string | null;
    symbol: string | null;
  }>(
    `SELECT i.id, i.ui_type AS ui, i.group_name AS grp,
            coalesce(i.current_price_currency, i.buy_currency)::text AS ccy,
            i.manual_ticker AS ticker, ins.display_name AS display, ins.symbol
       FROM budgeting.investments i
       LEFT JOIN budgeting.instruments ins ON ins.id = i.instrument_id
      WHERE i.tenant_id = $1
      ORDER BY i.archived_at NULLS FIRST, i.sort_order, i.id`,
    [pair.source],
  );
  const counters = new Map<string, number>();
  const taken = new Map<string, Set<string>>();
  const groups = new Map<string, Map<string, string>>();
  const bump = (key: string) => {
    const k = counters.get(key) ?? 0;
    counters.set(key, k + 1);
    return k;
  };
  for (const h of holdings.rows) {
    const ui = h.ui ?? "other";
    let name: string;
    if (ui === "crypto" || ui === "stocks" || ui === "etf") {
      const ticker =
        h.display?.match(/\(([^)]+)\)\s*$/)?.[1] ??
        h.ticker ??
        h.symbol?.toUpperCase() ??
        P.stablecoin;
      name = `${ticker} – ${P.places[bump(`place:${ticker}`) % P.places.length]}`;
    } else if (ui === "precious_metals" || ui === "collectibles") {
      name = lapName(P.coins, bump(ui));
    } else if (ui === "broker") {
      name = lapName(P.brokers, bump(ui));
    } else if (ui === "cash") {
      const src = (h.ccy ?? pair.currency).toUpperCase();
      const c = pair.currencyMap[src] ?? src; // what the visitor will see
      name = `${lapName(P.cashAccounts, bump(`cash:${c}`))} ${c}`;
    } else if (ui === "treasury_bond") {
      name = lapName(P.bonds, bump(ui));
    } else {
      name = lapName(P.holding, bump("other"));
    }
    // UNIQUE (budget_id, ui_type, lower(btrim(name))).
    const seen = taken.get(ui) ?? new Set<string>();
    taken.set(ui, seen);
    let unique = name;
    for (let n = 2; seen.has(unique.toLowerCase()); n++)
      unique = `${name} ${n}`;
    seen.add(unique.toLowerCase());
    out.push([h.id, "name", unique, null]);

    if (h.grp) {
      const byGroup = groups.get(ui) ?? new Map<string, string>();
      groups.set(ui, byGroup);
      if (!byGroup.has(h.grp)) {
        const list = ui === "precious_metals" ? P.groupMetals : P.groupDefault;
        byGroup.set(h.grp, lapName(list, byGroup.size));
      }
      out.push([h.id, "group_name", byGroup.get(h.grp)!, null]);
    }
  }

  // Incomes: by cadence, the biggest first.
  const incomes = await client.query<{ id: string; cadence: string }>(
    `SELECT id, cadence FROM budgeting.incomes WHERE tenant_id = $1 ORDER BY amount DESC, id`,
    [pair.source],
  );
  const PREFERRED: Record<string, number[]> = {
    MONTHLY: [0, 4, 6, 1],
    ONCE: [2, 5, 1],
    YEARLY: [2, 3, 7],
    WEEKLY: [1, 6],
  };
  const usedIncome = new Set<number>();
  for (const inc of incomes.rows) {
    const order = [
      ...(PREFERRED[inc.cadence] ?? []),
      ...P.income.map((_, i) => i),
    ];
    const k = order.find((i) => !usedIncome.has(i)) ?? 0;
    usedIncome.add(k);
    out.push([inc.id, "name", P.income[k]!, null]);
  }

  if (!out.length) return;
  await client.query(
    `INSERT INTO demo_names (src, field, name, concept)
     SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::int[])`,
    [
      out.map((o) => o[0]),
      out.map((o) => o[1]),
      out.map((o) => o[2]),
      out.map((o) => o[3]),
    ],
  );
}

/** The k-th name of a list, numbered once it wraps: "Cash", …, "Cash 2". */
function lapName(list: string[], k: number): string {
  const lap = Math.floor(k / list.length);
  return lap === 0 ? list[k]! : `${list[k % list.length]} ${lap + 1}`;
}

/**
 * Wealth history, re-levelled onto the demo's own present value.
 *
 * `budget_wealth_snapshots` stores totals ALREADY CONVERTED into the source
 * budget's currency, so copying them through a currency relabel redenominates
 * without converting. Each series is therefore scaled by (its live value ÷ its
 * newest source point); the money factor cancels out of that ratio.
 *
 * The live values are PASSED IN, never computed here. Twice now this module
 * tried to derive capitalization in SQL and got it wrong — first by omitting
 * investments entirely (~45% low), then by valuing holdings as
 * quantity x stored price, which ignores the live price cache and the
 * per-type rules for metals premiums and deposit accrual (~21% low, and it was
 * the reported "+21.6% since yesterday": the card computed one number and the
 * chart another). Capitalization has a single definition, in
 * compute-budget-wealth-now, and this takes it from there.
 */
export async function levelWealthHistory(
  client: PoolClient,
  pair: Pick<CopyPair, "source" | "dest" | "currency" | "demoUserId">,
  live: { capitalizationCents: bigint; investmentValueCents: bigint },
): Promise<void> {
  await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
    `{${pair.source},${pair.dest}}`,
  ]);
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
    pair.demoUserId,
  ]);

  // Clear any previously levelled rows for this tenant — this runs in its own
  // transaction, after the copy has committed, so it must be idempotent.
  await client.query(
    `DELETE FROM budgeting.budget_wealth_snapshots WHERE tenant_id = $1`,
    [pair.dest],
  );

  await client.query(
    `WITH newest AS (
       SELECT capitalization_cents AS cap, investment_value_cents AS inv
         FROM budgeting.budget_wealth_snapshots
        WHERE tenant_id = $1
        ORDER BY captured_at DESC LIMIT 1
     ),
     r AS (
       SELECT COALESCE($4::numeric / NULLIF(newest.cap, 0), 0) AS cap_ratio,
              COALESCE($5::numeric / NULLIF(newest.inv, 0), 0) AS inv_ratio
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
    [
      pair.source,
      pair.dest,
      pair.currency,
      live.capitalizationCents.toString(),
      live.investmentValueCents.toString(),
    ],
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
  await buildNameMap(client, pair);
  await wipeDemoTenant(client, pair.dest);
  return copyIntoDemoTenant(client, pair, live);
}
