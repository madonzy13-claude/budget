/**
 * account-deletion-cascade.test.ts — Plan 10-06 (CRITICAL GDPR guard)
 *
 * tenancy/shared_kernel have NO DB FK to identity.users, so deleting a user
 * cascades NOTHING automatically. purgeUserData() is the application-level
 * cascade run from Better Auth's user.deleteUser.beforeDelete. This real-Postgres
 * test proves: a PRIVATE-owner purge leaves zero residual rows + no live DEK; a
 * sole-owner-of-SHARED-with-members is BLOCKED (deletes nothing); a member-only
 * deletion removes just that user's rows and ANONYMISES their authored reserve
 * adjustments in the budget they leave (created_by → NULL), keeping the data.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withUserContext } from "@budget/platform";
import {
  createAuth,
  purgeUserData,
} from "../src/adapters/persistence/better-auth";
import { signUp } from "../src/application/sign-up";

const KEK = "A".repeat(43) + "=";
const keyStore = new LibsodiumKeyStore(KEK);

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
}, 120_000);

function auth() {
  return createAuth({ emailSender: new StdoutEmailSender(), keyStore });
}

async function newUser(tag: string): Promise<string> {
  const r = await signUp(
    { auth: auth() },
    {
      email: `del-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      password: "changeme1234",
      name: tag,
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (!r.isOk()) throw r.error;
  return r.value.userId;
}

// Seed a budget owned by `owner` with a category + (optional) second member +
// (optional) a reserve adjustment authored by `adjustmentBy`. Returns budgetId.
async function seedBudget(
  owner: string,
  kind: "PRIVATE" | "SHARED",
  opts: { secondMember?: string; adjustmentBy?: string } = {},
): Promise<string> {
  const budgetId = crypto.randomUUID();
  const catId = crypto.randomUUID();
  const r = await withUserContext(UserId(owner), async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${budgetId}}'`));
    await tx.execute(
      sql.raw(
        `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id)
         VALUES ('${budgetId}', 's-${budgetId}', 'B', '${kind}', 'USD', '${owner}')`,
      ),
    );
    await tx.execute(
      sql.raw(
        `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role)
         VALUES (gen_random_uuid(), '${budgetId}', '${owner}', 'owner')`,
      ),
    );
    if (opts.secondMember) {
      await tx.execute(
        sql.raw(
          `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role)
           VALUES (gen_random_uuid(), '${budgetId}', '${opts.secondMember}', 'member')`,
        ),
      );
    }
    await tx.execute(
      sql.raw(
        `INSERT INTO budgeting.categories (id, tenant_id, name, actor_user_id)
         VALUES ('${catId}', '${budgetId}', 'Groceries', '${owner}')`,
      ),
    );
    if (opts.adjustmentBy) {
      await tx.execute(
        sql.raw(
          `INSERT INTO budgeting.category_reserve_adjustments (id, tenant_id, category_id, delta_cents, created_by)
           VALUES (gen_random_uuid(), '${budgetId}', '${catId}', 1000, '${opts.adjustmentBy}')`,
        ),
      );
    }
  });
  if (r.isErr()) throw r.error;
  return budgetId;
}

async function scalar(
  ctxUser: string,
  budgetId: string | null,
  query: string,
): Promise<number> {
  const r = await withUserContext(UserId(ctxUser), async (tx) => {
    if (budgetId)
      await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${budgetId}}'`));
    const res = await tx.execute(sql.raw(query));
    return Number((res.rows[0] as { n: number }).n);
  });
  if (r.isErr()) throw r.error;
  return r.value;
}

const countBudget = (u: string, b: string) =>
  scalar(
    u,
    b,
    `SELECT count(*)::int AS n FROM tenancy.budgets WHERE id = '${b}'`,
  );
const countMembers = (u: string, b: string) =>
  scalar(
    u,
    b,
    `SELECT count(*)::int AS n FROM tenancy.budget_members WHERE budget_id = '${b}'`,
  );
const countTenant = (u: string, b: string, t: string) =>
  scalar(u, b, `SELECT count(*)::int AS n FROM ${t} WHERE tenant_id = '${b}'`);
const countUserKeys = (u: string) =>
  scalar(
    u,
    null,
    `SELECT count(*)::int AS n FROM shared_kernel.user_keys WHERE user_id = '${u}'`,
  );
const countAnonAdjustments = (u: string, b: string) =>
  scalar(
    u,
    b,
    `SELECT count(*)::int AS n FROM budgeting.category_reserve_adjustments WHERE tenant_id = '${b}' AND created_by IS NULL`,
  );

test("PRIVATE-owner deletion purges the budget, its tenant data, and the DEK", async () => {
  const a = await newUser("priv");
  const b = await seedBudget(a, "PRIVATE", { adjustmentBy: a });

  expect(await countBudget(a, b)).toBe(1);
  expect(await countTenant(a, b, "budgeting.categories")).toBe(1);
  expect(
    await countTenant(a, b, "budgeting.category_reserve_adjustments"),
  ).toBe(1);
  expect(await countUserKeys(a)).toBe(1);

  await purgeUserData(a);

  expect(await countBudget(a, b)).toBe(0);
  expect(await countMembers(a, b)).toBe(0);
  expect(await countTenant(a, b, "budgeting.categories")).toBe(0);
  expect(
    await countTenant(a, b, "budgeting.category_reserve_adjustments"),
  ).toBe(0);
  expect(await countUserKeys(a)).toBe(0);
});

test("sole owner of a SHARED budget with other members is BLOCKED and deletes nothing", async () => {
  const a = await newUser("shareowner");
  const b2 = await newUser("shared2");
  const b = await seedBudget(a, "SHARED", { secondMember: b2 });

  await expect(purgeUserData(a)).rejects.toThrow();

  expect(await countBudget(a, b)).toBe(1);
  expect(await countMembers(a, b)).toBe(2);
  expect(await countUserKeys(a)).toBe(1);
});

test("member-only deletion removes the member + DEK and anonymises their authored adjustments", async () => {
  const owner = await newUser("owner");
  const member = await newUser("member");
  const b = await seedBudget(owner, "SHARED", {
    secondMember: member,
    adjustmentBy: member,
  });

  await purgeUserData(member);

  // Owner's budget + the owner's membership survive; the member is gone.
  expect(await countBudget(owner, b)).toBe(1);
  expect(await countMembers(owner, b)).toBe(1);
  expect(await countUserKeys(member)).toBe(0);
  // The adjustment row is kept but its author link is severed.
  expect(
    await countTenant(owner, b, "budgeting.category_reserve_adjustments"),
  ).toBe(1);
  expect(await countAnonAdjustments(owner, b)).toBe(1);
});
