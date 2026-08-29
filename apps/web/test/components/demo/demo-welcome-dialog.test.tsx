/**
 * demo-welcome-dialog.test.tsx
 *
 * The assertion that carries this component is "never persists to the account".
 * The demo login is SHARED: if the language choice were saved to the user row
 * the way the settings control saves it, the first visitor's pick would become
 * everyone's. Everything else here is ordinary dialog behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/budgets",
}));

const apiCalls: string[] = [];
vi.mock("@/lib/api-client", () => ({
  api: new Proxy(
    {},
    {
      get(_t, prop) {
        apiCalls.push(String(prop));
        return () => {
          throw new Error("demo dialog must not call the API");
        };
      },
    },
  ),
}));

import { DemoWelcomeDialog } from "@/components/demo/demo-welcome-dialog";

const assign = vi.fn();

beforeEach(() => {
  apiCalls.length = 0;
  assign.mockClear();
  window.localStorage.clear();
  document.cookie = "budget-locale=; path=/; max-age=0";
  Object.defineProperty(window, "location", {
    value: { assign, pathname: "/en/budgets" },
    writable: true,
  });
});

afterEach(() => {
  window.localStorage.clear();
});

describe("DemoWelcomeDialog", () => {
  it("renders nothing at all for a non-demo user", () => {
    const { container } = render(<DemoWelcomeDialog isDemo={false} />);
    expect(container.textContent).toBe("");
  });

  it("appears on first paint for the demo user", async () => {
    render(<DemoWelcomeDialog isDemo />);
    expect(await screen.findByText("welcome_title")).toBeTruthy();
  });

  it("offers exactly English, Polish and Ukrainian", async () => {
    render(<DemoWelcomeDialog isDemo />);
    await screen.findByText("welcome_title");
    for (const code of ["en", "pl", "uk"]) {
      expect(screen.getByTestId(`demo-lang-${code}`)).toBeTruthy();
    }
  });

  it("does not reappear once the visitor has seen it", async () => {
    window.localStorage.setItem("budget-demo-welcome-seen", "1");
    const { container } = render(<DemoWelcomeDialog isDemo />);
    await Promise.resolve();
    expect(container.textContent).not.toContain("welcome_title");
  });

  it("stores the language in a cookie and NEVER on the shared account", async () => {
    render(<DemoWelcomeDialog isDemo />);
    await screen.findByText("welcome_title");
    fireEvent.click(screen.getByTestId("demo-lang-pl"));

    expect(document.cookie).toContain("budget-locale=pl");
    expect(assign).toHaveBeenCalledWith("/pl/budgets");
    // The whole point: no settings API call. If this ever goes red, one
    // visitor's language is about to become every visitor's.
    expect(apiCalls).toEqual([]);
  });

  it("survives localStorage being unavailable (private browsing)", async () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error("blocked");
    };
    try {
      render(<DemoWelcomeDialog isDemo />);
      expect(await screen.findByText("welcome_title")).toBeTruthy();
    } finally {
      window.localStorage.getItem = original;
    }
  });
});
