import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { WalletSectionsPo } from "../page-objects/WalletSectionsPo";

const { Given, When, Then } = createBdd(test);

Given(
  "a {string} wallet {string} holds {float} {string}",
  async ({ freshUser }, walletType: string, name: string, amount: number, currency: string) => {
    const headers = {
      "content-type": "application/json",
      cookie: freshUser.cookieHeader,
      Origin: freshUser.baseUrl,
      "X-Budget-ID": freshUser.budgetId,
    };
    const created = await fetch(`${freshUser.baseUrl}/api/wallets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, walletType, currency }),
    });
    if (!created.ok) throw new Error(`createWallet ${created.status}: ${await created.text()}`);
    const { id } = (await created.json()) as { id: string };
    const balance = await fetch(`${freshUser.baseUrl}/api/wallets/${id}/balance`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ amount: amount.toFixed(2), currency }),
    });
    if (!balance.ok) throw new Error(`setBalance ${balance.status}: ${await balance.text()}`);
  },
);

When(
  "I change the {string} wallet {string} currency to {string}",
  async ({ page }, section: string, name: string, currency: string) => {
    await new WalletSectionsPo(page).setRowCurrency(section, name, currency);
  },
);

Then(
  "the {string} wallet {string} is in {string}",
  async ({ page }, section: string, name: string, currency: string) => {
    await new WalletSectionsPo(page).assertRowCurrency(section, name, currency);
  },
);

Then(
  "the {string} section total is more than {int} in the budget currency",
  async ({ page }, section: string, floor: number) => {
    await new WalletSectionsPo(page).assertSectionTotalAbove(section, floor);
  },
);
