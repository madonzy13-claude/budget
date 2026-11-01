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

// R6 (user): an automatic amount explains how it changes (its title).
Then(
  "the asset {string} explains how its amount changes",
  async ({ page }, name: string) => {
    const amount = page
      .getByTestId(`holding-row-${name}`)
      .locator('[data-testid^="holding-amount-readonly-"]')
      .locator("visible=true");
    await expect(amount).toHaveAttribute("title", /add a transaction/, {
      timeout: 15000,
    });
  },
);

// I1 (user): the asset's and the group's currency pickers are tap-and-switch.
Then(
  "the currency of the asset {string} and of the {string} group carry the dotted line",
  async ({ page }, name: string, type: string) => {
    // On a phone an open group shows its currency as plain text — close it.
    const group = page.getByTestId(`investment-group-${type}`);
    if (
      (page.viewportSize()?.width ?? 1280) < 640 &&
      (await group.getAttribute("aria-expanded")) === "true"
    )
      await group.click({ position: { x: 24, y: 12 } });
    for (const cell of [
      page
        .getByTestId(`holding-row-${name}`)
        .locator('[data-testid^="asset-currency-"]'),
      page.getByTestId(`investment-type-currency-${type}`),
    ])
      await expect(
        cell.locator("select, button").locator("visible=true").first(),
      ).toHaveCSS("text-decoration-style", "dotted");
  },
);

// R6 (user): the "updated … ago" line is gone everywhere.
Then("nothing shows an updated line", async ({ page }) => {
  await expect(page.getByTestId("updated-ago")).toHaveCount(0);
});

// I1 (user): a dotted line marks what can be tapped and typed — nothing is
// dimmed any more.
Then(
  "the wallet {string} and the asset {string} carry the dotted line",
  async ({ page }, wallet: string, asset: string) => {
    const walletRow = page
      .locator("[data-wallet-row-wrapper]", { hasText: wallet })
      .locator("visible=true")
      .first();
    for (const field of ["name", "amount"])
      await expect(
        walletRow
          .locator(`[data-nav-field="${field}"] .editable-dots`)
          .locator("visible=true")
          .first(),
      ).toHaveCSS("text-decoration-style", "dotted");
    await expect(
      page
        .getByTestId(`holding-row-${asset}`)
        .locator("[data-amount-cell] .editable-dots")
        .locator("visible=true")
        .first(),
    ).toHaveCSS("text-decoration-style", "dotted");
  },
);

Then(
  "the asset {string} and the {string} group carry no dotted line",
  async ({ page }, asset: string, type: string) => {
    // Their amounts can't be typed — no dots there (the currency picker is
    // tap-and-switch, so it is dotted).
    await expect(
      page
        .getByTestId(`holding-row-${asset}`)
        .locator("[data-amount-cell] .editable-dots"),
    ).toHaveCount(0);
    await expect(
      page
        .getByTestId(`investment-type-value-${type}`)
        .locator(
          ".editable-dots:not([data-testid^='investment-type-currency-'])",
        ),
    ).toHaveCount(0);
    const amount = page
      .getByTestId(`holding-row-${asset}`)
      .locator('[data-testid^="holding-amount-readonly-"]')
      .locator("visible=true");
    await expect(amount).toHaveCSS("opacity", "1");
  },
);

// iOS never paints an underline inside a native <select>: the phone's
// currency cell draws its dots as a background instead.
Then(
  "the wallet {string} currency shows its dots on a phone",
  async ({ page }, wallet: string) => {
    const select = page
      .locator("[data-wallet-row-wrapper]", { hasText: wallet })
      .locator("visible=true")
      .first()
      .locator('[data-nav-field="currency"] select');
    await expect(select).toBeVisible({ timeout: 15000 });
    await expect(select).toHaveCSS(
      "background-image",
      /repeating-linear-gradient/,
    );
  },
);
