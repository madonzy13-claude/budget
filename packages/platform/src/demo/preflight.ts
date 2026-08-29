/**
 * preflight.ts — the demo scrub's allowlist gate.
 *
 * The demo tenant is rebuilt every night from the owner's live data, with no
 * human in the loop. That is only safe if an unclassified column cannot flow
 * through. This module compares the manifest against `information_schema` in
 * both directions and reports every discrepancy; the caller (the refresh job)
 * aborts on any finding, BEFORE the wipe, so a schema change degrades to
 * "yesterday's demo" rather than "unreviewed field is public".
 *
 * Fail closed. There is deliberately no permissive default and no rule for
 * "columns I did not think about".
 */
import type { Pool } from "pg";

export type Rule =
  | { kind: "COPY" }
  | { kind: "SCALE_MONEY"; decimals: 0 | 4 }
  | { kind: "RELABEL_CURRENCY" }
  | {
      kind: "FAKE_TEXT";
      pool: "merchant" | "category" | "wallet" | "budget" | "holding";
    }
  | { kind: "NULL" }
  | { kind: "REMAP_ID"; references?: string }
  | { kind: "TENANT" }
  | { kind: "OWNER" }
  /** Column the DB computes (`GENERATED ALWAYS`) — omitted from the INSERT. */
  | { kind: "GENERATED" };

/**
 * `copy`      — wiped from the demo tenant, then re-copied from the source.
 * `wipe-only` — wiped, never copied. For tables that are derived (an aggregate
 *               a reconciler rebuilds), transient (an event queue, an
 *               idempotency cache), hold real device/user handles (push
 *               subscriptions, share tokens), or store free-form JSON blobs
 *               that column-level rules cannot classify (audit before/after).
 *               Wiping them anyway is what stops owner-shaped rows from
 *               accumulating in the demo tenant across nights.
 */
export type TableMode = "copy" | "wipe-only";

/**
 * A column that exists on SOME deployments but not others — the residue of
 * hand-applied DDL that never became a migration. Marking it `optional` means
 * "if it is there, apply this rule; if it is not, say nothing".
 *
 * This is deliberately ONE-SIDED. It relaxes `missing_column` (manifest knows a
 * column the DB lacks — harmless) and never relaxes `unmanifested_column` (DB
 * has a column nobody classified — the dangerous direction, which must always
 * stop the run).
 *
 * Every use needs a comment saying why the drift exists. If the answer is
 * "someone should write a migration", write the migration instead.
 */
export type ColumnEntry = Rule & { optional?: true };

export type TableManifest = {
  table: string; // "schema.table"
  mode: TableMode;
  columns: Record<string, ColumnEntry>;
};

export type ManifestFinding =
  | { type: "unmanifested_column"; table: string; column: string }
  | { type: "missing_column"; table: string; column: string }
  | { type: "missing_table"; table: string }
  | { type: "unmanifested_table"; table: string };

/** Schemas that hold copyable user data. */
const DATA_SCHEMAS = ["budgeting", "tenancy", "shared_kernel"];

/**
 * Ad-hoc backup tables left behind by past data migrations. They carry
 * `tenant_id`, so the "new tenant-scoped table" check would flag all of them
 * forever. They are not application tables, they are never copied, and
 * app_role/worker_role hold no grant on them. Ignored EXPLICITLY — by naming
 * convention, in one place — rather than silently.
 */
function isIgnoredTable(schema: string, table: string): boolean {
  return table.startsWith("_");
}

export async function checkManifest(
  pool: Pool,
  manifest: TableManifest[],
): Promise<ManifestFinding[]> {
  const { rows } = await pool.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(
    `select table_schema, table_name, column_name
       from information_schema.columns
      where table_schema = ANY($1::text[])`,
    [DATA_SCHEMAS],
  );

  // Live shape: "schema.table" -> Set(columns)
  const live = new Map<string, Set<string>>();
  // Which live tables carry a tenant_id — the ones that hold copyable user data.
  const tenantScoped = new Set<string>();

  for (const r of rows) {
    if (isIgnoredTable(r.table_schema, r.table_name)) continue;
    const key = `${r.table_schema}.${r.table_name}`;
    if (!live.has(key)) live.set(key, new Set());
    live.get(key)!.add(r.column_name);
    if (r.column_name === "tenant_id") tenantScoped.add(key);
  }

  const findings: ManifestFinding[] = [];
  const manifested = new Set(manifest.map((m) => m.table));

  for (const m of manifest) {
    const liveCols = live.get(m.table);
    if (!liveCols) {
      findings.push({ type: "missing_table", table: m.table });
      continue;
    }
    for (const col of liveCols) {
      if (!(col in m.columns)) {
        findings.push({
          type: "unmanifested_column",
          table: m.table,
          column: col,
        });
      }
    }
    for (const [col, rule] of Object.entries(m.columns)) {
      if (!liveCols.has(col) && !rule.optional) {
        findings.push({ type: "missing_column", table: m.table, column: col });
      }
    }
  }

  // A whole new tenant-scoped table must stop the run too — otherwise a future
  // phase adds a table, the demo silently never copies (or never wipes) it, and
  // stale owner-shaped rows accumulate in the demo tenant across refreshes.
  for (const t of tenantScoped) {
    if (!manifested.has(t)) {
      findings.push({ type: "unmanifested_table", table: t });
    }
  }

  return findings;
}
