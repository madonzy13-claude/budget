/**
 * demo-preflight.test.ts — the allowlist gate.
 *
 * This is the mitigation the whole "re-pull real data nightly" decision rests
 * on. The demo copies the owner's live tables unattended; if the schema grows a
 * column nobody has classified, the ONLY acceptable outcome is that the refresh
 * stops. These tests exist to make sure it stops.
 *
 * Do not weaken an assertion here to a warning. A preflight that cannot fail
 * the run is not a preflight.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { checkManifest, type TableManifest } from "../src/demo/preflight";

let pool: Pool;

beforeAll(async () => {
  const { urlMigrator } = await startTestcontainer();
  pool = new Pool({ connectionString: urlMigrator });
  // A stand-in for the 27 ad-hoc `_*_backup` tables that past data migrations
  // left in the live budgeting schema. Created here so the ignore rule is
  // tested against a table this suite controls, not against whatever happens
  // to be lying around on a particular dev box.
  await pool.query(
    `create table if not exists budgeting._demo_preflight_backup (
       id uuid primary key, tenant_id uuid not null, amount_cents bigint)`,
  );
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

/**
 * A manifest covering every tenant-scoped table in the live schema, built from
 * the DB itself. Tests then perturb ONE thing, so each assertion isolates the
 * drift it is about.
 */
async function fullManifestFromLive(): Promise<TableManifest[]> {
  const { rows } = await pool.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(
    `select table_schema, table_name, column_name
       from information_schema.columns
      where table_schema = ANY($1::text[])
        and table_name not like '\\_%'
        and (table_schema, table_name) in (
          select table_schema, table_name from information_schema.columns
           where column_name = 'tenant_id')`,
    [["budgeting", "tenancy", "shared_kernel"]],
  );
  const byTable = new Map<string, TableManifest>();
  for (const r of rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!byTable.has(key))
      byTable.set(key, { table: key, mode: "copy", columns: {} });
    byTable.get(key)!.columns[r.column_name] = { kind: "COPY" };
  }
  return [...byTable.values()];
}

function find(m: TableManifest[], table: string): TableManifest {
  const t = m.find((x) => x.table === table);
  if (!t) throw new Error(`fixture missing ${table}`);
  return t;
}

describe("checkManifest", () => {
  test("a manifest matching the live schema reports nothing", async () => {
    expect(await checkManifest(pool, await fullManifestFromLive())).toEqual([]);
  });

  test("a live column the manifest has never seen is reported", async () => {
    const m = await fullManifestFromLive();
    delete find(m, "budgeting.categories").columns["name"];
    expect(await checkManifest(pool, m)).toEqual([
      {
        type: "unmanifested_column",
        table: "budgeting.categories",
        column: "name",
      },
    ]);
  });

  test("a column added by a future migration stops the run", async () => {
    // The scenario the user's nightly-re-pull choice makes real: someone adds a
    // column, nobody classifies it, and the next unattended refresh would copy
    // it to a public login. It must abort instead.
    const m = await fullManifestFromLive();
    await pool.query(
      `alter table budgeting.categories add column private_note text`,
    );
    try {
      expect(await checkManifest(pool, m)).toEqual([
        {
          type: "unmanifested_column",
          table: "budgeting.categories",
          column: "private_note",
        },
      ]);
    } finally {
      await pool.query(
        `alter table budgeting.categories drop column private_note`,
      );
    }
  });

  test("a manifest column that no longer exists is reported", async () => {
    const m = await fullManifestFromLive();
    find(m, "budgeting.categories").columns[
      "column_removed_by_a_later_migration"
    ] = { kind: "COPY" };
    expect(await checkManifest(pool, m)).toEqual([
      {
        type: "missing_column",
        table: "budgeting.categories",
        column: "column_removed_by_a_later_migration",
      },
    ]);
  });

  test("a manifested table that does not exist is reported", async () => {
    const m = await fullManifestFromLive();
    m.push({
      table: "budgeting.no_such_table",
      mode: "copy",
      columns: { id: { kind: "COPY" } },
    });
    expect(await checkManifest(pool, m)).toEqual([
      { type: "missing_table", table: "budgeting.no_such_table" },
    ]);
  });

  test("a whole tenant-scoped table the manifest omits stops the run", async () => {
    // The other half of the allowlist. Without this, a future phase adds a
    // table, the demo never copies OR wipes it, and owner-shaped rows would
    // accumulate in the demo tenant across refreshes.
    const m = (await fullManifestFromLive()).filter(
      (t) => t.table !== "budgeting.wallets",
    );
    expect(await checkManifest(pool, m)).toEqual([
      { type: "unmanifested_table", table: "budgeting.wallets" },
    ]);
  });

  test("ignores the ad-hoc _-prefixed migration backup tables", async () => {
    // 27 of these carry tenant_id in the live budgeting schema, left behind by
    // past data migrations. They are not application tables and are never
    // copied — but without an explicit ignore they would abort every run.
    const findings = await checkManifest(pool, await fullManifestFromLive());
    expect(
      findings.filter((f) => "table" in f && f.table.includes("._")),
    ).toEqual([]);
  });
});

describe("the real demoManifest", () => {
  test("classifies every column of every table it touches", async () => {
    // The gate on the gate. If this goes red after a migration, the demo
    // refresh is ALREADY refusing to run — go classify the new column in
    // manifest.ts rather than relaxing anything here.
    const { demoManifest } = await import("../src/demo/manifest");
    expect(await checkManifest(pool, demoManifest)).toEqual([]);
  });

  test("no user-authored text column is COPY", async () => {
    // COPY on a free-text column is the one mistake that publishes real data.
    const { demoManifest } = await import("../src/demo/manifest");
    const SUSPECT = /(^|_)(name|note|description|label|title|comment|slug)$/;
    const offenders: string[] = [];
    for (const t of demoManifest) {
      for (const [col, rule] of Object.entries(t.columns)) {
        if (SUSPECT.test(col) && rule.kind === "COPY") {
          offenders.push(`${t.table}.${col}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every tenant-scoped table is wiped, whether or not it is copied", async () => {
    // wipe-only tables still have to be wiped, or owner-shaped rows survive in
    // the demo tenant from one night to the next.
    const { demoManifest } = await import("../src/demo/manifest");
    const { rows } = await pool.query<{ t: string }>(
      `select table_schema||'.'||table_name as t
         from information_schema.columns
        where column_name = 'tenant_id'
          and table_schema = ANY($1::text[])
          and table_name not like '\\_%'`,
      [["budgeting", "tenancy", "shared_kernel"]],
    );
    const manifested = new Set(demoManifest.map((m) => m.table));
    for (const r of rows) expect(manifested.has(r.t)).toBe(true);
  });
});

describe("optional columns", () => {
  test("an optional column absent from the DB is NOT reported", async () => {
    const m = await fullManifestFromLive();
    find(m, "budgeting.categories").columns["only_on_some_deployments"] = {
      kind: "NULL",
      optional: true,
    };
    expect(await checkManifest(pool, m)).toEqual([]);
  });

  test("optional NEVER relaxes the dangerous direction", async () => {
    // `optional` exists to tolerate a column the DB lacks. A column the DB HAS
    // and nobody classified must still stop the run — marking things optional
    // must never become a way to wave real data through.
    const m = await fullManifestFromLive();
    delete find(m, "budgeting.categories").columns["name"];
    find(m, "budgeting.categories").columns["unrelated_optional"] = {
      kind: "NULL",
      optional: true,
    };
    expect(await checkManifest(pool, m)).toEqual([
      {
        type: "unmanifested_column",
        table: "budgeting.categories",
        column: "name",
      },
    ]);
  });
});

describe("copy order", () => {
  test("covers every manifested table exactly once", async () => {
    const { demoManifest, DEMO_COPY_ORDER } =
      await import("../src/demo/manifest");
    expect([...DEMO_COPY_ORDER].sort()).toEqual(
      demoManifest
        .map((t) => t.table)
        .sort() as (typeof DEMO_COPY_ORDER)[number][],
    );
  });

  test("reserve adjustments are wiped before categories", async () => {
    // categories has a NO ACTION FK from category_reserve_adjustments — the
    // same edge that had to be special-cased in the account-deletion cascade.
    // The wipe walks the copy order backwards, so adjustments must come AFTER
    // categories here.
    const { DEMO_COPY_ORDER } = await import("../src/demo/manifest");
    const o = [...DEMO_COPY_ORDER];
    expect(o.indexOf("budgeting.category_reserve_adjustments")).toBeGreaterThan(
      o.indexOf("budgeting.categories"),
    );
  });

  test("every table can be row-scoped", async () => {
    const { demoManifest, rowScope } = await import("../src/demo/manifest");
    for (const t of demoManifest) expect(rowScope(t).column).toBeTruthy();
  });
});
