/**
 * cleanup-fixture-data.ts — every scenario takes its own data away with it.
 *
 * The fresh-user fixtures signed a brand-new account up over HTTP and then
 * simply ended. Nothing removed it, so a full run left ~94 permanent accounts
 * behind, each with a budget — and because the 3-hourly wealth-snapshot cron
 * scans EVERY budget in the database, each abandoned budget kept growing rows
 * of its own for ever after. By 260811 that had reached 6,099 users and 2.3M
 * snapshots, most of the database (user cleanup, 260811).
 *
 * So teardown runs after `use()` in each fixture. Two rules make it safe:
 *
 *   1. It deletes ONLY the ids the fixture itself created — never a pattern
 *      like `email LIKE '%@test.local'`, which would reach across a parallel
 *      run (or, on a shared box, somebody's real data).
 *   2. A shared budget is dropped only once its LAST member leaves. The
 *      share-link scenarios put two fixture users in one budget; whichever
 *      tears down first removes only its own membership.
 *
 * Failure here must never fail a passing test — a scenario's job is to make an
 * assertion, not to prove the janitor works — so everything is wrapped and a
 * problem is warned about, loudly, rather than thrown.
 *
 * RLS: app_role sees these tables under FORCE ROW LEVEL SECURITY, so the tenant
 * and user GUCs are set per statement batch, mirroring the seed helpers in
 * steps/tasks.steps.ts.
 */

/** Tables keyed by tenant_id. Order matters only where FKs exist, but this is
 *  the same order the 260811 cleanup used, children first. */
const TENANT_TABLES = [
  "budgeting.budget_wealth_snapshots",
  "budgeting.budget_mode_history",
  "budgeting.budget_template_items",
  "budgeting.budget_templates",
  "budgeting.category_reserve_adjustments",
  "budgeting.category_share_overrides",
  "budgeting.category_limits",
  "budgeting.reserve_fit_exclusions",
  "budgeting.expense_ledger",
  "budgeting.scheduled_payments",
  "budgeting.incomes",
  "budgeting.investments",
  "budgeting.tasks",
  "budgeting.categories",
  "budgeting.wallets",
  "budgeting.spending_by_category_month",
  "shared_kernel.audit_history",
  "shared_kernel.idempotency_keys",
  "shared_kernel.notification_prefs",
  "shared_kernel.outbox",
  "shared_kernel.push_subscriptions",
  "tenancy.budget_share_links",
] as const;

/** Tables keyed by budget_id, which must go before tenancy.budgets (its FKs
 *  are NO ACTION, not CASCADE). */
const BUDGET_TABLES = [
  "budgeting.budget_share_dirty",
  "tenancy.budget_invitations",
  "tenancy.shared_budget_member_shares",
  "tenancy.budget_members",
] as const;

/** Tables keyed by user_id, which must go before identity.users.
 *
 *  budgeting.api_rate_limits is deliberately NOT here: app_role is granted
 *  SELECT/INSERT/UPDATE on it but not DELETE, on purpose — the application must
 *  not be able to clear its own rate limits. Its rows are ephemeral counters
 *  keyed by user_id with no FK, so a few orphans are harmless. */
const USER_TABLES = [
  "identity.accounts",
  "identity.sessions",
  "identity.user_preferences",
  "shared_kernel.user_keys",
  "tenancy.onboarding_progress",
] as const;

function dbUrl(): string {
  return process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
}

/**
 * One DELETE, isolated behind a savepoint. A table the app_role cannot touch
 * must not take the rest of the batch down with it: the first version aborted
 * the whole transaction on `permission denied for table api_rate_limits`, so
 * the account it was there to remove survived (observed 260811).
 */
async function tryDelete(
  client: import("pg").PoolClient,
  label: string,
  text: string,
  params: unknown[],
): Promise<void> {
  await client.query("SAVEPOINT s");
  try {
    await client.query(text, params);
    await client.query("RELEASE SAVEPOINT s");
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT s");
    console.warn(`[e2e cleanup] skipped ${label}: ${(e as Error).message}`);
  }
}

/**
 * Remove the account this scenario created, and any budget left with nobody in
 * it. Safe to call twice; safe to call for a user that never got a budget.
 */
export async function destroyFixtureUser(input: {
  userId: string;
  email?: string;
}): Promise<void> {
  const url = dbUrl();
  if (!url) {
    console.warn(
      "[e2e cleanup] DATABASE_URL_APP not set — scenario data left behind",
    );
    return;
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url });
  try {
    const client = await pool.connect();
    try {
      // Which budgets is this user in? Read under their own context.
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
        input.userId,
      ]);
      const mine = await client.query<{ budget_id: string }>(
        `SELECT budget_id FROM tenancy.budget_members WHERE user_id = $1::uuid`,
        [input.userId],
      );
      await client.query("COMMIT");
      const budgetIds = mine.rows.map((r) => r.budget_id);

      // Drop this user's membership, then find which of those budgets are now
      // empty — a co-tenant's fixture will clear the rest when it tears down.
      const orphaned: string[] = [];
      if (budgetIds.length > 0) {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
          `{${budgetIds.join(",")}}`,
        ]);
        await client.query(
          `SELECT set_config('app.current_user_id', $1, true)`,
          [input.userId],
        );
        await client.query(
          `DELETE FROM tenancy.budget_members WHERE user_id = $1::uuid`,
          [input.userId],
        );
        const left = await client.query<{ budget_id: string }>(
          `SELECT b.id AS budget_id
             FROM tenancy.budgets b
            WHERE b.id = ANY($1::uuid[])
              AND NOT EXISTS (SELECT 1 FROM tenancy.budget_members m WHERE m.budget_id = b.id)`,
          [budgetIds],
        );
        orphaned.push(...left.rows.map((r) => r.budget_id));
        await client.query("COMMIT");
      }

      // Everything belonging to the now-empty budgets.
      if (orphaned.length > 0) {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
          `{${orphaned.join(",")}}`,
        ]);
        await client.query(
          `SELECT set_config('app.current_user_id', $1, true)`,
          [input.userId],
        );
        for (const t of TENANT_TABLES) {
          await tryDelete(
            client,
            t,
            `DELETE FROM ${t} WHERE tenant_id = ANY($1::uuid[])`,
            [orphaned],
          );
        }
        for (const t of BUDGET_TABLES) {
          await tryDelete(
            client,
            t,
            `DELETE FROM ${t} WHERE budget_id = ANY($1::uuid[])`,
            [orphaned],
          );
        }
        await tryDelete(
          client,
          "tenancy.budgets",
          `DELETE FROM tenancy.budgets WHERE id = ANY($1::uuid[])`,
          [orphaned],
        );
        await client.query("COMMIT");
      }

      // …and the account itself.
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
        input.userId,
      ]);
      for (const t of USER_TABLES) {
        await tryDelete(
          client,
          t,
          `DELETE FROM ${t} WHERE user_id = $1::uuid`,
          [input.userId],
        );
      }
      if (input.email) {
        await tryDelete(
          client,
          "identity.verifications",
          `DELETE FROM identity.verifications WHERE identifier = $1`,
          [input.email],
        );
      }
      await tryDelete(
        client,
        "identity.users",
        `DELETE FROM identity.users WHERE id = $1::uuid`,
        [input.userId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    // Loud, but never fatal: a scenario proves a behaviour, not the janitor.
    console.warn(
      `[e2e cleanup] could not remove fixture user ${input.userId}:`,
      (e as Error).message,
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
