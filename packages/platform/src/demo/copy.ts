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
import { poolValues, type TextPool } from "./rules";

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

/** SQL that yields a value from a text pool, chosen by hashing the row id. */
function poolExpr(pool: TextPool, keyExpr: string): string {
  const values = poolValues(pool).map(literal).join(",");
  return `(ARRAY[${values}])[(abs(hashtext(${keyExpr}::text)) % ${poolValues(pool).length}) + 1]`;
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
  keyExpr: string,
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
      return rule.decimals === 0
        ? `round(src.${col(name)}::numeric * ${s})::bigint`
        : `round(src.${col(name)}::numeric * ${s}, 4)`;
    }
    case "RELABEL_CURRENCY": {
      // Unmapped codes pass through unchanged — that is how the family pair
      // keeps PLN while the personal pair relabels it.
      const m = bind("ccy", JSON.stringify(pair.currencyMap), "::jsonb");
      return `coalesce(${m} ->> upper(src.${col(name)}::text), src.${col(name)}::text)`;
    }
    case "FAKE_TEXT":
      return `CASE WHEN src.${col(name)} IS NULL THEN NULL ELSE ${poolExpr(rule.pool, keyExpr)} END`;
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
    const keyExpr = "id" in t.columns ? "src.id" : `src.${col(scope.column)}`;

    for (const [name, rule] of Object.entries(t.columns)) {
      // An `optional` column is one this deployment may not have (hand-applied
      // DDL that never became a migration). Naming it in the INSERT would make
      // the whole refresh fail on the deployments that lack it.
      if (rule.optional && !live.get(t.table)?.has(name)) continue;
      const expr = columnExpr(rule, name, pair, bind, keyExpr);
      if (expr === null) continue;
      names.push(col(name));
      exprs.push(expr);
    }

    const res = await client.query(
      `INSERT INTO ${ident(t.table)} (${names.join(", ")})
       SELECT ${exprs.join(", ")}
         FROM ${ident(t.table)} src
        WHERE src.${col(scope.column)} = $1`,
      values,
    );
    counts[t.table] = res.rowCount ?? 0;
  }

  await synthesiseMembership(client, pair);
  return counts;
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
