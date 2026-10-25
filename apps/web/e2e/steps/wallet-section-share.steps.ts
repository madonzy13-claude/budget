import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { WalletSectionsPo } from "../page-objects/WalletSectionsPo";

const { Given, Then } = createBdd(test);

Given(
  "a {string} wallet holds {float} USD",
  async ({ freshUser }, walletType: string, amount: number) => {
    const headers = {
      "content-type": "application/json",
      cookie: freshUser.cookieHeader,
      Origin: freshUser.baseUrl,
      "X-Budget-ID": freshUser.budgetId,
    };
    const created = await fetch(`${freshUser.baseUrl}/api/wallets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: `E2E ${walletType}`, walletType, currency: "USD" }),
    });
    if (!created.ok) throw new Error(`createWallet ${created.status}: ${await created.text()}`);
    const { id } = (await created.json()) as { id: string };
    const balance = await fetch(`${freshUser.baseUrl}/api/wallets/${id}/balance`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ amount: amount.toFixed(2), currency: "USD" }),
    });
    if (!balance.ok) throw new Error(`setBalance ${balance.status}: ${await balance.text()}`);
  },
);

Then(
  "the {string} section header shows {string} beside its name",
  async ({ page }, type: string, pct: string) => {
    const po = new WalletSectionsPo(page);
    await expect(po.sectionShare(type)).toBeVisible();
    await expect(po.sectionShare(type)).toHaveText(pct);
    const [total, share] = await Promise.all([
      po.sectionTotal(type).boundingBox(),
      po.sectionShare(type).boundingBox(),
    ]);
    // Left of the total, on the same line.
    expect(share!.x + share!.width).toBeLessThan(total!.x);
    expect(Math.abs(share!.y + share!.height / 2 - (total!.y + total!.height / 2))).toBeLessThan(4);
  },
);

Then(
  "the {string} section total looks like its share",
  async ({ page }, type: string) => {
    const po = new WalletSectionsPo(page);
    const look = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.fontFamily, s.fontSize, s.fontWeight, s.color, s.opacity].join("|");
    };
    expect(await po.sectionTotal(type).evaluate(look)).toBe(
      await po.sectionShare(type).evaluate(look),
    );
  },
);
