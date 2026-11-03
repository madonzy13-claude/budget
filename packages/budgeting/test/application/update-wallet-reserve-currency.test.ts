/**
 * update-wallet-reserve-currency.test.ts — D-09: RESERVE wallets may be in any
 * currency. Settlement (plan 12) covers each currency's need first and nets
 * the rest; a currency with no FX pair is listed as unconvertible.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ReserveBudget } from "../reserves/currency-fixture";
import { updateWallet } from "../../src/application/update-wallet";
import { DrizzleWalletRepo } from "../../src/adapters/persistence/wallet-repo";

const b = new ReserveBudget();
const walletId = async (ccy: string) =>
  (await b.sql(`SELECT id::text FROM budgeting.wallets WHERE tenant_id = $1 AND currency = $2 LIMIT 1`, [b.tenant, ccy]))
    .rows[0].id as string;
const update = (id: string, currency: string) =>
  updateWallet({ repo: new DrizzleWalletRepo(), budgetCurrencyOf: async () => "PLN" })({
    tenantId: b.tenant,
    walletId: id,
    actorUserId: b.user,
    currency,
  });

describe.skipIf(!process.env.DATABASE_URL_APP)("Reserve wallets in any currency", () => {
  beforeAll(async () => {
    await b.create("PLN");
    await b.rates([{ base: "EUR", quote: "PLN", date: "1998-05-01", rate: "4.30" }]);
    const eur = await b.category("EUR");
    await b.adjust(eur, 1000, "EUR", "1998-05-02T12:00:00Z");
    await b.wallet("PLN", "10.00");
  });
  afterAll(() => b.drop());

  test("a RESERVE wallet can switch to another currency than the budget's", async () => {
    const r = await update(await walletId("PLN"), "EUR");
    expect(r.isOk() ? "ok" : r.error.message).toBe("ok");
    expect((await b.sql(`SELECT currency FROM budgeting.wallets WHERE tenant_id = $1`, [b.tenant])).rows[0].currency).toBe("EUR");
    // 10 EUR now covers the EUR category's 10 EUR need exactly — FX-free (D-11).
    expect(await b.task()).toBeNull();
  });

  test("a currency with no FX pair is allowed and reported, not fatal", async () => {
    const r = await update(await walletId("EUR"), "BTC");
    expect(r.isOk()).toBe(true);
    const pos = await b.positions();
    expect(pos.settlement?.unconvertible).toContain("BTC");
  });
});
