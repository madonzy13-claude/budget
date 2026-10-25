import { expect, type Page } from "@playwright/test";

/**
 * PullToRefreshPo — the shell's custom pull-to-refresh (installed app only).
 *
 * Chromium can't emulate `display-mode: standalone` (CDP ignores it), so
 * `installAsApp` fakes it the two ways the app reads it: `matchMedia` for
 * pull-to-refresh.tsx, and the locked-body layout for CSS, where `<main>` is
 * the scroller instead of the page.
 */
export class PullToRefreshPo {
  constructor(private readonly page: Page) {}

  async installAsApp(): Promise<void> {
    await this.page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => {
        const mql = real(q);
        // Keep the real object (its listeners) and override only `matches`.
        if (q.includes("display-mode: standalone"))
          Object.defineProperty(mql, "matches", { get: () => true });
        else if (q.includes("display-mode: browser"))
          Object.defineProperty(mql, "matches", { get: () => false });
        return mql;
      };
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = `
          html, body { height: 100% !important; overflow: hidden !important; }
          [data-shell-root] { height: 100lvh !important; min-height: 0 !important; }
          main[data-shell-scroll] { flex: 1 1 0% !important; min-height: 0 !important; overflow-y: auto !important; }`;
        document.head.appendChild(s);
      });
    });
  }

  async scrollPageDown(): Promise<void> {
    const main = this.page.locator("main[data-shell-scroll]");
    await main.evaluate((el) => el.scrollTo(0, 400));
    await expect
      .poll(() => main.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
  }

  /** Drag down 200px from the header without letting go (a release reloads). */
  async pullFromHeaderWithoutRelease(): Promise<void> {
    await this.page.locator("[data-shell-header]").evaluate((header) => {
      const at = (y: number) => {
        const t = new Touch({ identifier: 1, target: header, clientX: 100, clientY: y });
        return { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true };
      };
      header.dispatchEvent(new TouchEvent("touchstart", at(20)));
      header.dispatchEvent(new TouchEvent("touchmove", at(220)));
    });
  }

  async expectIndicatorShown(): Promise<void> {
    await expect(
      this.page.getByTestId("pull-to-refresh-indicator"),
    ).toHaveAttribute("aria-hidden", "false");
  }
}
