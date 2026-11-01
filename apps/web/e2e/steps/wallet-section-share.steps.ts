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
      body: JSON.stringify({
        name: `E2E ${walletType}`,
        walletType,
        currency: "USD",
      }),
    });
    if (!created.ok)
      throw new Error(
        `createWallet ${created.status}: ${await created.text()}`,
      );
    const { id } = (await created.json()) as { id: string };
    const balance = await fetch(
      `${freshUser.baseUrl}/api/wallets/${id}/balance`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ amount: amount.toFixed(2), currency: "USD" }),
      },
    );
    if (!balance.ok)
      throw new Error(`setBalance ${balance.status}: ${await balance.text()}`);
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
    expect(
      Math.abs(share!.y + share!.height / 2 - (total!.y + total!.height / 2)),
    ).toBeLessThan(4);
  },
);

Then(
  "the {string} section total looks like its share",
  async ({ page }, type: string) => {
    const po = new WalletSectionsPo(page);
    const look = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.fontFamily, s.fontSize, s.fontWeight, s.color, s.opacity].join(
        "|",
      );
    };
    expect(await po.sectionTotal(type).evaluate(look)).toBe(
      await po.sectionShare(type).evaluate(look),
    );
  },
);

// A real phone: touch points, so pickers render the native <select>.
Given("I am on a touch phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  // A phone has no hover — yet a tap leaves :hover stuck, like iOS does.
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "hover", value: "none" },
      { name: "pointer", value: "coarse" },
    ],
  });
});

// R6 (user): on a phone the currency code sits ~10px from the widest amount
// of its column — wallets, investment groups and assets alike.
Then(
  "on a phone every currency sits about 10px from its column's widest amount",
  async ({ page }) => {
    await expect(
      page.locator('[data-testid^="asset-currency-"]').first(),
    ).toBeVisible({ timeout: 15000 });
    const gaps = await page.evaluate(() => {
      // The "↻ 5m ago" line hangs under the amount (F9); it is not the
      // amount's width — leave it out of the measurement.
      for (const el of document.querySelectorAll<HTMLElement>(
        '[data-testid="updated-ago"]',
      ))
        el.style.display = "none";
      const visible = (el: Element) =>
        (el as HTMLElement).offsetParent !== null &&
        el.getBoundingClientRect().width > 0;
      const textW = (el: Element) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return r.getBoundingClientRect().width;
      };
      const codeRight = (cell: Element) => {
        const sel = cell.querySelector("select");
        if (!sel) {
          const r = document.createRange();
          r.selectNodeContents(cell);
          return r.getBoundingClientRect().right;
        }
        const cs = getComputedStyle(sel);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = cs.font;
        const w = ctx.measureText(sel.value).width;
        const box = sel.getBoundingClientRect();
        const right = [cs.textAlignLast, cs.textAlign].some(
          (a) => a === "right" || a === "end",
        );
        return right
          ? box.right - parseFloat(cs.paddingRight)
          : box.left + parseFloat(cs.paddingLeft) + w;
      };
      const cells = [
        ...document.querySelectorAll(
          '[data-wallet-row-wrapper] [data-nav-field="currency"], [data-testid^="asset-currency-"], [data-testid^="investment-type-currency-"]',
        ),
      ].filter(visible);
      const rows = cells.map((cell) => {
        let amt = cell.nextElementSibling;
        while (amt && !visible(amt)) amt = amt.nextElementSibling;
        const box = amt!.getBoundingClientRect();
        return {
          id: cell.getAttribute("data-testid") ?? "wallet",
          code: codeRight(cell),
          right: Math.round(box.right),
          col: `${cell.closest('[data-testid^="wallet-section-"]')?.getAttribute("data-testid")}|${cell.getAttribute("data-testid")?.startsWith("investment-type-") ? "groups" : cell.closest('[data-testid^="investment-group-guide-"]')?.getAttribute("data-testid")}@${Math.round(box.right)}`,
          w: textW(amt!),
        };
      });
      const cols = new Map<string, typeof rows>();
      for (const r of rows) cols.set(r.col, [...(cols.get(r.col) ?? []), r]);
      return [...cols.values()].map((col) => {
        const widest = col.reduce((a, b) => (b.w > a.w ? b : a));
        return {
          id: widest.col,
          gap: Math.round(widest.right - widest.w - widest.code),
        };
      });
    });
    expect(gaps.length).toBeGreaterThan(1);
    for (const g of gaps) {
      expect(g.gap, g.id).toBeGreaterThanOrEqual(7);
      expect(g.gap, g.id).toBeLessThanOrEqual(13);
    }
  },
);

// R6 (user): a tapped group reads like a tapped asset — no picker to hit.
Then(
  "the open {string} group shows its currency as plain text, not a picker",
  async ({ page }, type: string) => {
    const group = page.getByTestId(`investment-group-${type}`);
    if ((await group.getAttribute("aria-expanded")) !== "true")
      await group.click({ position: { x: 24, y: 12 } });
    await expect(group).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByTestId(`investment-type-currency-${type}`),
    ).toBeHidden();
    await expect(
      page.getByTestId(`investment-type-value-${type}`),
    ).toContainText(/USD\s*100/);
  },
);

// R6 (user): every wallet and asset says when its amount last changed; an
// amount that prices itself carries a lock.
Then(
  "the wallet {string} says when its balance was updated",
  async ({ page }, name: string) => {
    const row = page
      .locator("[data-wallet-row-wrapper]", { hasText: name })
      .locator("visible=true")
      .first();
    // F9 (user): right under the amount.
    await expect(
      row.locator("[data-amount-cell]").getByTestId("updated-ago"),
    ).toBeVisible({ timeout: 15000 });
  },
);

Then(
  "the asset {string} says when it was updated, with no lock",
  async ({ page }, name: string) => {
    const row = page.getByTestId(`holding-row-${name}`).locator("visible=true");
    await expect(
      row.locator("[data-amount-cell]").getByTestId("updated-ago"),
    ).toHaveAttribute("data-kind", "value", { timeout: 15000 });
    await expect(row.locator('[data-testid^="asset-auto-lock-"]')).toHaveCount(
      0,
    );
  },
);

Then("the asset {string} carries a lock", async ({ page }, name: string) => {
  const row = page.getByTestId(`holding-row-${name}`).locator("visible=true");
  await expect(
    row.locator('[data-testid^="asset-auto-lock-"]').locator("visible=true"),
  ).toBeVisible({ timeout: 15000 });
});
