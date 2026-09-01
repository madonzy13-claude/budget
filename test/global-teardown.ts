/**
 * global-teardown.ts — the integration suite takes its data away with it.
 *
 * Preloaded by bunfig.toml, so the hook below is registered once for the whole
 * run regardless of which files execute.
 *
 * Why this exists: 68 test files under apps/api/test and packages/*&#47;test connect
 * to the DEV database (`DATABASE_URL_APP` with @db: rewritten to @localhost:),
 * because CLAUDE.md forbids mocking the DB in integration tests. Only 4 of them
 * had any teardown and exactly 1 deleted its users, so every `make test` run
 * left accounts behind for ever. By 260824 that was 2,138 `@example.com` users
 * against 11 real ones — and once hourly backups started, the project was
 * paying to store them and re-store them, every hour, for a year.
 *
 * The real fix is an ephemeral database per run (packages/db/test/testcontainer.ts
 * exists and is used by 2 files). This is not that. This is the requirement the
 * user actually stated — "it's fine when we are running tests, but all test data
 * must be deleted afterwards" — met without touching 68 files.
 *
 * ponytail: superuser + session_replication_role, not a hand-maintained table
 * list. A hardcoded cascade rots the moment somebody adds a table; enumerating
 * from information_schema cannot. purgeUserData() in
 * packages/identity/src/adapters/persistence/better-auth.ts remains the
 * authoritative cascade for REAL account deletion — it anonymises authored rows
 * and spares shared budgets. Test users need none of that care.
 */
import { afterAll } from "bun:test";
import type { Pool as PgPool } from "pg";

/** Domains that only ever belong to a test. Verified against the live database
 *  on 260824: 2,138 @example.com + 84 @test.local, and zero real accounts on
 *  either. A real user signing up on one of these would be deleted — which is
 *  why the list is exact domains, never a substring like "test". */
const TEST_EMAIL_PATTERNS = [
  "%@example.com", // apps/api/test integration suite
  "%@test.local", // apps/web/e2e fixtures
  "%@test.example", // tests/tenant-leak — the `make ci-gate` users
];

/**
 * A budget nobody is a member of is unreachable: every RLS policy here keys off
 * membership, so no human can ever open it again. It is residue — but the
 * 3-hourly wealth-snapshot cron scans EVERY budget in the database, so each one
 * keeps growing rows for ever (39,119 snapshots across 641 orphans by 260824).
 *
 * The hour of grace avoids racing a signup in another process that has created
 * the budget but not yet its membership row.
 */
const ORPHAN_BUDGET_GRACE = "1 hour";

/**
 * When this run began. Anything member-less created after this instant belongs
 * to THIS run and can go immediately — the grace period above exists only to
 * avoid racing a signup in another process, and a budget this run created is
 * not that race.
 *
 * Without this the suite's own orphans (78 of them, from the tenant-leak tests)
 * outlived their teardown and waited an hour for the NEXT run to collect them,
 * which is not "deleted afterwards".
 */
const RUN_STARTED_AT = new Date().toISOString();

/**
 * Superuser connection. app_role cannot DELETE from audit_history, outbox or
 * user_keys — that is deliberate (the app must not erase its own audit trail),
 * and it is why the E2E fixture logs "permission denied" on every scenario.
 * A janitor needs rights the application is correctly denied.
 */
/**
 * Snapshotted at PRELOAD, which runs before any test file is imported.
 *
 * packages/db/test/testcontainer.ts starts an ephemeral Postgres with
 * POSTGRES_PASSWORD=postgres and then reassigns process.env.DATABASE_URL_APP to
 * point at it. Reading the variable in afterAll therefore reads the
 * TESTCONTAINER's address, and the teardown tries to open the dev password
 * against a throwaway container — "password authentication failed for user
 * postgres", with the real database never touched and its rows left behind.
 */
const ENV_AT_LOAD = {
  override: process.env["TEST_TEARDOWN_DATABASE_URL"],
  password: process.env["POSTGRES_PASSWORD"],
  appUrl: process.env["DATABASE_URL_APP"],
} as const;

function teardownUrl(): string | undefined {
  if (ENV_AT_LOAD.override) return ENV_AT_LOAD.override;
  const pw = ENV_AT_LOAD.password;
  const app = ENV_AT_LOAD.appUrl;
  if (!pw || !app) return undefined;
  // Borrow host/port/db from the app URL; swap in the superuser.
  try {
    const u = new URL(app.replace("@db:", "@localhost:"));
    return `postgres://postgres:${encodeURIComponent(pw)}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return undefined;
  }
}

async function purgeTestData(pool: PgPool): Promise<number> {
  const client = await pool.connect();
  try {
    const { rows: users } = await client.query<{ id: string }>(
      `SELECT id FROM identity.users WHERE ${TEST_EMAIL_PATTERNS.map(
        (_, i) => `email LIKE $${i + 1}`,
      ).join(" OR ")}`,
      TEST_EMAIL_PATTERNS,
    );
    const userIds = users.map((u) => u.id);

    // Budgets these users belong to, PLUS any budget already left with nobody in
    // it — a previous run that deleted memberships without their budget still
    // left one behind, and it would otherwise be fed by the snapshot cron for
    // ever.
    const { rows: budgets } = await client.query<{ budget_id: string }>(
      `SELECT DISTINCT budget_id FROM tenancy.budget_members WHERE user_id = ANY($1::uuid[])
       UNION
       SELECT b.id FROM tenancy.budgets b
        WHERE NOT EXISTS (SELECT 1 FROM tenancy.budget_members m WHERE m.budget_id = b.id)
          AND (b.created_at >= $2::timestamptz
               OR b.created_at < now() - interval '${ORPHAN_BUDGET_GRACE}')`,
      [userIds, RUN_STARTED_AT],
    );
    const budgetIds = budgets.map((b) => b.budget_id);
    // No early return when both are empty: the user_keys orphan sweep below has
    // to run regardless, and it is exactly the case where nothing else matches
    // that leaves it stranded (439 rows sat through a run that returned here).
    // Every delete below no-ops on an empty id array.

    await client.query("BEGIN");
    // Disable FK triggers for this session so rows can be removed in ANY order.
    // Several FKs here are NO ACTION rather than CASCADE, so a fixed order would
    // have to be correct AND stay correct; this removes the constraint entirely.
    await client.query("SET LOCAL session_replication_role = replica");

    let deleted = 0;
    const byColumn = async (column: string, ids: string[]) => {
      if (ids.length === 0) return;
      const { rows: tables } = await client.query<{
        table_schema: string;
        table_name: string;
      }>(
        `SELECT table_schema, table_name
           FROM information_schema.columns
          WHERE column_name = $1
            AND table_schema IN ('budgeting','tenancy','identity','shared_kernel')
            AND table_name NOT IN ('users','budgets')`,
        [column],
      );
      for (const t of tables) {
        const r = await client.query(
          `DELETE FROM "${t.table_schema}"."${t.table_name}" WHERE "${column}" = ANY($1::uuid[])`,
          [ids],
        );
        deleted += r.rowCount ?? 0;
      }
    };

    await byColumn("tenant_id", budgetIds);
    await byColumn("budget_id", budgetIds);
    await byColumn("user_id", userIds);

    // shared_kernel.user_keys has NO foreign key to identity.users, so rows for
    // users deleted before this teardown existed were never cleaned up — 439 of
    // them against 7 real users by 260824. Swept explicitly rather than by a
    // general "delete every orphan by user_id" rule: some user_id columns are
    // audit trail, and purgeUserData deliberately anonymises those (created_by
    // → NULL) rather than deleting them. Key material for a user who no longer
    // exists has no such value.
    const k = await client.query(
      `DELETE FROM shared_kernel.user_keys k
        WHERE NOT EXISTS (SELECT 1 FROM identity.users u WHERE u.id = k.user_id)`,
    );
    deleted += k.rowCount ?? 0;

    const b = await client.query(
      `DELETE FROM tenancy.budgets WHERE id = ANY($1::uuid[])`,
      [budgetIds],
    );
    const u = await client.query(
      `DELETE FROM identity.users WHERE id = ANY($1::uuid[])`,
      [userIds],
    );
    deleted += (b.rowCount ?? 0) + (u.rowCount ?? 0);
    await client.query("COMMIT");
    return deleted;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

afterAll(async () => {
  const url = teardownUrl();
  // Unit-only runs have no database and must not be slowed down or broken by a
  // janitor they never needed.
  if (!url) return;
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    try {
      const n = await purgeTestData(pool);
      // ALWAYS report, including zero. Logging only on n>0 makes "cleaned
      // nothing because there was nothing" and "never ran at all" look
      // identical — which cost an hour on 260825, when a teardown silently
      // skipped because a snapshotted env var was undefined and the silence
      // read as success.
      console.log(`[test teardown] removed ${n} test rows`);
    } finally {
      await pool.end().catch(() => {});
    }
  } catch (e) {
    // Loud, never fatal — a suite proves behaviour, not that the janitor works.
    console.warn(`[test teardown] FAILED: ${(e as Error).message}`);
  }
});

/**
 * …and the throwaway Postgres CONTAINER with it.
 *
 * 37 test files call startTestcontainer(); none called stopTestcontainer().
 * The helper only reaped on a SIGNAL, so a test process that finished normally
 * — the usual case — left its container running. By 260901 that was 73 orphans
 * holding 3.2 GiB of RAM, the oldest two days old, and the box OOM-killed the
 * systemd user manager three times in one morning. The kernel takes
 * user@1000.service first (systemd sets oom_score_adj 100/200 on it), so what
 * the user actually saw was every tmux session vanishing.
 *
 * Registered here rather than in 37 files for the same reason the row cleanup
 * above is: the preload runs once per test process and covers every file in it.
 * A no-op when this process never started a container, so files that talk to
 * the dev database pay nothing. `docker stop` is enough to reclaim it — the
 * container runs with --rm and its PGDATA is tmpfs.
 */
afterAll(async () => {
  try {
    const { stopTestcontainer } =
      await import("../packages/db/test/testcontainer");
    await stopTestcontainer();
  } catch (e) {
    // Loud, never fatal — same rule as the row cleanup above.
    console.warn(
      `[test teardown] container stop FAILED: ${(e as Error).message}`,
    );
  }
});
