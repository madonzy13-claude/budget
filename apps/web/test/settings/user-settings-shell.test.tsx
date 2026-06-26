/**
 * user-settings-shell.test.tsx — Plan 10-02
 *
 * Covers the 2-pill client carousel: both pills render, General is the default
 * pane (language + currency controls), clicking the User pill swaps to the
 * Profile/Security/Danger accordion AND pushes the URL via history.pushState with
 * NO Next navigation (assert pushState is called — the only "navigation").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserSettingsShell } from "@/components/settings/user-settings-shell";

// next-intl mock — echo the key so assertions are deterministic.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// motion/react mock — passthrough so panes mount synchronously (no animation).
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({
          children,
          className,
        }: {
          children?: React.ReactNode;
          className?: string;
        }) => {
          const Tag = tag as keyof React.JSX.IntrinsicElements;
          return <Tag className={className}>{children}</Tag>;
        },
    },
  ),
  useReducedMotion: () => false,
}));

// Reused General controls — stub out their api-client / locale deps.
vi.mock("@/components/settings/locale-select", () => ({
  LocaleSelect: () => <div data-testid="locale-select" />,
}));
vi.mock("@/components/settings/display-currency-picker", () => ({
  DisplayCurrencyPicker: () => <div data-testid="currency-picker" />,
}));

describe("UserSettingsShell — 2-pill carousel (USET-01/02/03)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState(null, "", "/en/settings");
  });

  it("renders both pills with General active by default (language + currency)", () => {
    render(
      <UserSettingsShell
        locale="en"
        initialTab="general"
        initialLocale="en"
        initialDisplayCurrency="USD"
      />,
    );
    expect(screen.getByTestId("settings-pill-general")).toBeInTheDocument();
    expect(screen.getByTestId("settings-pill-user")).toBeInTheDocument();
    // General pane: the two reused controls + their section headings.
    expect(screen.getByTestId("locale-select")).toBeInTheDocument();
    expect(screen.getByTestId("currency-picker")).toBeInTheDocument();
    expect(screen.getByText("locale.label")).toBeInTheDocument();
    expect(screen.getByText("display_currency.label")).toBeInTheDocument();
  });

  it("clicking the User pill swaps to the accordion and pushState's the URL (no Next nav)", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    render(
      <UserSettingsShell
        locale="en"
        initialTab="general"
        initialLocale="en"
        initialDisplayCurrency="USD"
      />,
    );

    fireEvent.click(screen.getByTestId("settings-pill-user"));

    // URL pushed to /en/settings/user — this is the ONLY navigation (no router).
    expect(pushSpy).toHaveBeenCalledWith(null, "", "/en/settings/user");
    // User pane: Profile / Security / Danger accordion section titles.
    expect(screen.getByText("profile")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("danger")).toBeInTheDocument();
    // General pane is no longer mounted.
    expect(screen.queryByTestId("locale-select")).not.toBeInTheDocument();
  });

  it("deep-link to the User tab renders the accordion first", () => {
    render(
      <UserSettingsShell
        locale="en"
        initialTab="user"
        initialLocale="en"
        initialDisplayCurrency="USD"
      />,
    );
    expect(screen.getByText("profile")).toBeInTheDocument();
    expect(screen.queryByTestId("locale-select")).not.toBeInTheDocument();
  });
});
