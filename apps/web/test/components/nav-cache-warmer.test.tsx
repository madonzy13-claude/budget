/**
 * nav-cache-warmer.test.tsx — verifies the warmer posts WARM_ROUTES (home +
 * current path) to the service worker while online, and stays silent offline.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const postMessage = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/budgets/x/wallets",
}));

import { NavCacheWarmer } from "../../src/components/common/nav-cache-warmer";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

beforeEach(() => {
  postMessage.mockReset();
  setOnline(true);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({ active: { postMessage } }),
      controller: { postMessage },
    },
  });
});

describe("NavCacheWarmer", () => {
  it("posts WARM_ROUTES (home + current path) to the SW when online", async () => {
    render(<NavCacheWarmer locale="en" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(postMessage).toHaveBeenCalledWith({
      type: "WARM_ROUTES",
      urls: ["/en", "/en/budgets/x/wallets"],
    });
  });

  it("does nothing while offline", async () => {
    setOnline(false);
    render(<NavCacheWarmer locale="en" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("also warms same-origin app links present on the page (budget cards / pills)", async () => {
    // Seed in-page app links (e.g. a home budget card + a BDP pill).
    const wrap = document.createElement("div");
    wrap.innerHTML =
      '<a href="/en/budgets/abc/wallets">A</a>' +
      '<a href="/en/budgets/def/spendings?x=1">B</a>' +
      '<a href="/signup">ext</a>'; // non-locale → ignored
    document.body.appendChild(wrap);
    try {
      render(<NavCacheWarmer locale="en" />);
      await new Promise((r) => setTimeout(r, 30));
      const urls = postMessage.mock.calls[0][0].urls as string[];
      expect(urls).toContain("/en");
      expect(urls).toContain("/en/budgets/x/wallets"); // current path
      expect(urls).toContain("/en/budgets/abc/wallets");
      expect(urls).toContain("/en/budgets/def/spendings"); // query stripped
      expect(urls).not.toContain("/signup");
    } finally {
      document.body.removeChild(wrap);
    }
  });
});
