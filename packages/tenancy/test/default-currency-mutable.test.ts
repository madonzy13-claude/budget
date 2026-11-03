/**
 * default-currency-mutable.test.ts — Phase 14 (D-01): a budget's currency can
 * change at any time, including after transactions exist. Every total is
 * re-expressed at read time from each row's own amount + currency + date, so
 * the old first-transaction lock (route guard + Better Auth hook) is gone.
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
import * as betterAuthOrg from "../src/adapters/persistence/better-auth-org";

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

test("Budget currency > a budget WITH transactions can change its default_currency (Phase 14, D-01)", async () => {
  const { tenancy, identity } = makeModules();
  const { ownerUserId, budgetId } = await makeOwnerWithBudget(identity, "currency-withtx-mutable");

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
  expect(await tenancy.workspaceRepo.hasTransactions(budgetId)).toBe(true);

  // Totals re-express at read time (Phase 14), so nothing locks the currency.
  await tenancy.workspaceRepo.updateIdentity(budgetId, { defaultCurrency: "EUR" }, ownerUserId);
  expect((await tenancy.workspaceRepo.findById(budgetId))?.default_currency).toBe("EUR");
  await tenancy.workspaceRepo.updateIdentity(budgetId, { defaultCurrency: "USD" }, ownerUserId);
  expect((await tenancy.workspaceRepo.findById(budgetId))?.default_currency).toBe("USD");
});

test("Better Auth hook > no currency lock is left on the org update path", () => {
  expect("assertCurrencyChangeAllowed" in betterAuthOrg).toBe(false);
});
