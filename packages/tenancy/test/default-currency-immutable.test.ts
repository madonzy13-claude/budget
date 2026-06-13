/**
 * TENT-11, D-04: default_currency lock is TRANSACTION-AWARE.
 *
 * NEW rule (quick-260613-nkb): a budget's default_currency is editable until the
 * FIRST non-deleted transaction is recorded, then locked forever (historical
 * amount_cents are stored in that currency). The rule is owned by the APP layer
 * (budget-identity route guard + workspaceRepo.hasTransactions) and the Better
 * Auth beforeUpdateOrganization hook — NOT by a DB trigger. The old
 * `budgets_currency_immutable` trigger (which blocked ALL changes incl. zero-tx)
 * was removed in migration 0035 + post-migration.sql.
 *
 * Integration test — real Postgres (testcontainer).
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import { createIdentityModule } from "@budget/identity";
import { signUpHelper as signUp } from "./helpers";
import { createTenancyModule } from "@budget/tenancy";
import { createWorkspace } from "../src/application/create-workspace";
import { assertCurrencyChangeAllowed } from "../src/adapters/persistence/better-auth-org";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

function makeModules() {
  const sender = new StdoutEmailSender();
  const tenancy = createTenancyModule({
    emailSender: sender,
    appUrl: "http://localhost:3000",
  });
  const identity = createIdentityModule({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(),
    additionalPlugins: [tenancy.organizationPlugin],
    additionalSchema: tenancy.betterAuthSchema,
  });
  return { tenancy, identity };
}

async function makeOwnerWithBudget(
  identity: ReturnType<typeof makeModules>["identity"],
  emailTag: string,
) {
  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `${emailTag}-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  if (!owner.isOk()) throw new Error("signup failed");

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Currency Test",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) throw new Error("createWorkspace failed");

  return { ownerUserId: owner.value.userId, budgetId: w.value.budgetId };
}

test("Currency lock > zero-transaction budget CAN change default_currency", async () => {
  const { tenancy, identity } = makeModules();
  const { ownerUserId, budgetId } = await makeOwnerWithBudget(
    identity,
    "currency-zerotx",
  );

  // NO ledger rows → the currency lock must NOT fire. Drive the SAME code path
  // the PATCH route uses (workspaceRepo.updateIdentity → withTenantTx UPDATE
  // tenancy.budgets). With the old DB trigger removed this MUST succeed; before
  // the fix the trigger threw "default_currency is immutable".
  await tenancy.workspaceRepo.updateIdentity(
    budgetId,
    { defaultCurrency: "EUR" },
    ownerUserId,
  );

  // Read back via the repo — the row actually changed.
  const budget = await tenancy.workspaceRepo.findById(budgetId);
  expect(budget?.default_currency).toBe("EUR");
});

test("Currency lock > budget WITH a non-deleted transaction CANNOT change default_currency", async () => {
  const { tenancy, identity } = makeModules();
  const { ownerUserId, budgetId } = await makeOwnerWithBudget(
    identity,
    "currency-withtx",
  );

  // Insert one non-deleted ledger row (mirrors the reserve-event-loader fixture:
  // a category FK + a SPENDING ledger row, deleted_at NULL). Set app.tenant_ids
  // + app.current_user_id in the same tx so RLS allows the seed INSERTs.
  const safeId = budgetId.replace(/[^a-fA-F0-9-]/g, "");
  const seed = await withInfraTx(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));
    await tx.execute(
      sql.raw(`SET LOCAL app.current_user_id = '${ownerUserId}'`),
    );
    const cat = await tx.execute<{ id: string }>(sql`
      INSERT INTO budgeting.categories
        (id, tenant_id, name, sort_index, reserve_excluded, created_at, actor_user_id)
      VALUES (gen_random_uuid(), ${budgetId}::uuid, 'Grocery', 0, false, now(), ${ownerUserId}::uuid)
      RETURNING id
    `);
    const categoryId = cat.rows[0]?.id;
    await tx.execute(sql`
      INSERT INTO budgeting.expense_ledger
        (id, tenant_id, budget_id, category_id, transaction_date,
         amount_original_cents, currency_original, amount_converted_cents,
         fx_rate, fx_as_of, kind, confirmed_at, created_at)
      VALUES
        (gen_random_uuid(), ${budgetId}::uuid, ${budgetId}::uuid, ${categoryId}::uuid,
         now(), 20000, 'USD', 20000, 1, now(), 'SPENDING', now(), now())
    `);
  });
  expect(seed.isOk()).toBe(true);

  // The lock is now enforced at the app/route layer via hasTransactions — assert
  // the guard SIGNAL is true (NOT a DB throw, since the trigger is gone).
  const locked = await tenancy.workspaceRepo.hasTransactions(budgetId);
  expect(locked).toBe(true);
});

test("Better Auth hook > currency change on a ZERO-transaction budget is allowed", async () => {
  const { identity } = makeModules();
  const { ownerUserId, budgetId } = await makeOwnerWithBudget(
    identity,
    "currency-hook-zerotx",
  );

  // The Better Auth beforeUpdateOrganization hook delegates to this exact function.
  // Zero ledger rows → it must NOT throw. (Drives the production logic directly,
  // avoiding Better Auth's HTTP/session machinery which is unrelated to the rule.)
  let thrown = false;
  let thrownMsg = "";
  try {
    await assertCurrencyChangeAllowed({
      orgId: budgetId,
      actorUserId: ownerUserId,
    });
  } catch (e) {
    thrown = true;
    thrownMsg = (e as Error).message;
  }
  if (thrown) console.error("HOOK_ZEROTX_THREW:", thrownMsg);
  expect(thrown).toBe(false);
});

test("Better Auth hook > currency change on a budget WITH a transaction throws", async () => {
  const { identity } = makeModules();
  const { ownerUserId, budgetId } = await makeOwnerWithBudget(
    identity,
    "currency-hook-withtx",
  );

  // Seed one non-deleted ledger row.
  const safeId = budgetId.replace(/[^a-fA-F0-9-]/g, "");
  const seed = await withInfraTx(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));
    await tx.execute(
      sql.raw(`SET LOCAL app.current_user_id = '${ownerUserId}'`),
    );
    const cat = await tx.execute<{ id: string }>(sql`
      INSERT INTO budgeting.categories
        (id, tenant_id, name, sort_index, reserve_excluded, created_at, actor_user_id)
      VALUES (gen_random_uuid(), ${budgetId}::uuid, 'Grocery', 0, false, now(), ${ownerUserId}::uuid)
      RETURNING id
    `);
    const categoryId = cat.rows[0]?.id;
    await tx.execute(sql`
      INSERT INTO budgeting.expense_ledger
        (id, tenant_id, budget_id, category_id, transaction_date,
         amount_original_cents, currency_original, amount_converted_cents,
         fx_rate, fx_as_of, kind, confirmed_at, created_at)
      VALUES
        (gen_random_uuid(), ${budgetId}::uuid, ${budgetId}::uuid, ${categoryId}::uuid,
         now(), 20000, 'USD', 20000, 1, now(), 'SPENDING', now(), now())
    `);
  });
  expect(seed.isOk()).toBe(true);

  let thrown = false;
  try {
    await assertCurrencyChangeAllowed({
      orgId: budgetId,
      actorUserId: ownerUserId,
    });
  } catch (e) {
    thrown = true;
    expect((e as Error).message).toMatch(
      /currency|immutable|locked|transaction/i,
    );
  }
  expect(thrown).toBe(true);
});
