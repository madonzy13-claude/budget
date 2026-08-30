/**
 * public-header.test.tsx
 *
 * The logged-out header must absorb the top safe-area inset. With
 * `viewport-fit=cover` the page runs under the status bar in standalone mode,
 * so a header with no top padding put the brand mark on top of the clock and
 * battery — reported on iOS, on the sign-in page, which is exactly where a new
 * device lands first.
 *
 * Asserted on the class rather than by measuring: happy-dom does no real
 * layout, and `env(safe-area-inset-top)` is 0 everywhere except a real device.
 * What this pins is that the declaration is PRESENT and prefers the pre-paint
 * `--safe-top`. That it actually MOVES the header was verified separately in a
 * real browser by injecting a 47px inset — the brand mark shifted by exactly
 * 47px.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/common/public-locale-switcher", () => ({
  PublicLocaleSwitcher: () => <div data-testid="locale-switcher" />,
}));
vi.mock("@/components/common/header-theme-toggle", () => ({
  HeaderThemeToggle: () => <div data-testid="theme-toggle" />,
}));

import { PublicHeader } from "@/components/common/public-header";

function header(): HTMLElement {
  const el = document.querySelector("header");
  if (!el) throw new Error("no header rendered");
  return el as HTMLElement;
}

describe("PublicHeader", () => {
  it("reserves the top safe-area inset", () => {
    render(<PublicHeader locale="en" />);
    // --safe-top first (SafeAreaTopSync persists it pre-paint, because iOS
    // reports env() as 0 on a PWA's first frame and then resolves it — a
    // visible downward jump), env() as the fallback.
    expect(header().className).toContain(
      "pt-[var(--safe-top,env(safe-area-inset-top))]",
    );
  });

  it("shows the language and theme controls by default", () => {
    render(<PublicHeader locale="en" />);
    expect(screen.getByTestId("locale-switcher")).toBeTruthy();
    expect(screen.getByTestId("theme-toggle")).toBeTruthy();
  });

  it("can render brand-only, for the join and 404 pages", () => {
    render(<PublicHeader locale="en" controls={false} />);
    expect(screen.queryByTestId("locale-switcher")).toBeNull();
    expect(screen.queryByTestId("theme-toggle")).toBeNull();
    // Still reserves the inset — that is the whole reason these pages share it.
    expect(header().className).toContain(
      "pt-[var(--safe-top,env(safe-area-inset-top))]",
    );
  });

  it("keeps extra classes without dropping its own", () => {
    render(
      <PublicHeader locale="en" controls={false} className="backdrop-blur" />,
    );
    const cls = header().className;
    expect(cls).toContain("backdrop-blur");
    expect(cls).toContain("border-b");
  });
});
