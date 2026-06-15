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
});
