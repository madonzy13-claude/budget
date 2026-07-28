/**
 * push-repo-worker-scan.test.ts — regression for the dead budget-reminder.
 *
 * getAllSubscribedTenantIds() runs via withInfraTx (worker_role, NO app.tenant_ids
 * GUC) to find every budget that has a push subscription. push_subscriptions has
 * FORCE row-level security keyed on app.tenant_ids, so without a worker SELECT scan
 * policy the query matched ZERO rows → the hourly reminder cron iterated an empty
 * list and never sent a single push (to anyone, of any type that starts from this
 * scan). The fix is the `push_subscriptions_worker_cron_scan` policy in
 * apps/migrator/post-migration.sql (mirrors wallets/investments). This test seeds
 * subscriptions in two distinct tenants and asserts the cross-tenant scan sees both.
 */
import { test, expect, describe, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withBootstrapUserContext } from "../src/db/tx";
import { UserId } from "@budget/shared-kernel";
import {
  upsertSubscription,
  getAllSubscribedTenantIds,
  deleteAllSubscriptionsForBudget,
} from "../src/push/push-repo";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

async function seedUser(): Promise<string> {
  const id = crypto.randomUUID();
  const r = await withBootstrapUserContext(UserId(id), async (tx) => {
    await tx.execute(
      sql`INSERT INTO identity.users (id, email, email_hash, name, locale)
          VALUES (${id}, ${`${id}@scan.test`}, ${Buffer.from(id)}, 'Scan Test', 'en')`,
    );
  });
  if (r.isErr()) throw r.error;
  return id;
}

describe("getAllSubscribedTenantIds (worker cross-tenant scan)", () => {
  test("returns every tenant that has a subscription, across tenants", async () => {
    const userId = await seedUser();
    const tenantA = crypto.randomUUID();
    const tenantB = crypto.randomUUID();
    await upsertSubscription({
      tenantId: tenantA,
      userId,
      endpoint: `https://push.test/${tenantA}`,
      p256dh: "p256dh-a",
      auth: "auth-a",
      locale: "en",
    });
    await upsertSubscription({
      tenantId: tenantB,
      userId,
      endpoint: `https://push.test/${tenantB}`,
      p256dh: "p256dh-b",
      auth: "auth-b",
      locale: "en",
    });

    // Cross-tenant scan (worker_role, no app.tenant_ids GUC). Before the
    // worker_cron_scan policy this returned [] and the reminder never fired.
    const tenantIds = await getAllSubscribedTenantIds();
    expect(tenantIds).toContain(tenantA);
    expect(tenantIds).toContain(tenantB);
  });

  test("excludes ARCHIVED budgets (260723: archived budget kept sending reminders)", async () => {
    const userId = await seedUser();
    const activeBudget = crypto.randomUUID();
    const archivedBudget = crypto.randomUUID();
    // Seed two REAL budget rows: one active, one archived (as the owner).
    const seed = await withBootstrapUserContext(UserId(userId), async (tx) => {
      await tx.execute(sql`
        INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, archived_at)
        VALUES (${activeBudget}, ${"a" + activeBudget.slice(0, 8)}, 'Active', 'EUR', ${userId}, NULL),
               (${archivedBudget}, ${"z" + archivedBudget.slice(0, 8)}, 'Archived', 'EUR', ${userId}, now())
      `);
    });
    if (seed.isErr()) throw seed.error;
    for (const t of [activeBudget, archivedBudget]) {
      await upsertSubscription({
        tenantId: t,
        userId,
        endpoint: `https://push.test/${t}`,
        p256dh: "p",
        auth: "a",
        locale: "en",
      });
    }

    const tenantIds = await getAllSubscribedTenantIds();
    expect(tenantIds).toContain(activeBudget); // active still scanned
    expect(tenantIds).not.toContain(archivedBudget); // archived skipped
  });

  test("deleteAllSubscriptionsForBudget removes EVERY member's sub for that budget, leaving other budgets untouched", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const budget = crypto.randomUUID();
    const otherBudget = crypto.randomUUID();
    // Two members subscribed to `budget`; the owner also has `otherBudget`.
    await upsertSubscription({
      tenantId: budget,
      userId: owner,
      endpoint: `https://push.test/${budget}-owner`,
      p256dh: "p",
      auth: "a",
      locale: "en",
    });
    await upsertSubscription({
      tenantId: budget,
      userId: member,
      endpoint: `https://push.test/${budget}-member`,
      p256dh: "p",
      auth: "a",
      locale: "en",
    });
    await upsertSubscription({
      tenantId: otherBudget,
      userId: owner,
      endpoint: `https://push.test/${otherBudget}-owner`,
      p256dh: "p",
      auth: "a",
      locale: "en",
    });

    // Archive-cleanup: the owner drops the budget → every subscription for it
    // (across ALL members, RLS is tenant-scoped not user-scoped) is deleted.
    await deleteAllSubscriptionsForBudget(budget, owner);

    const tenantIds = await getAllSubscribedTenantIds();
    expect(tenantIds).not.toContain(budget); // both members' subs gone
    expect(tenantIds).toContain(otherBudget); // unrelated budget survives
  });
});
