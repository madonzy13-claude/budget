/**
 * user-settings-shell.test.tsx — Phase 10 (pills removed)
 *
 * The settings page is now a SINGLE stacked accordion (no pills, no carousel):
 * General · Profile · Security · Danger Zone, with General open by default.
 * Covers: all four section triggers render, the old pill chrome is gone, and the
 * General section (language + currency) is shown by default.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserSettingsShell } from "@/components/settings/user-settings-shell";

// next-intl mock — echo the key so assertions are deterministic.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Reused General controls — stub out their api-client / locale deps.
vi.mock("@/components/settings/locale-select", () => ({
  LocaleSelect: () => <div data-testid="locale-select" />,
}));
vi.mock("@/components/settings/display-currency-picker", () => ({
  DisplayCurrencyPicker: () => <div data-testid="currency-picker" />,
}));

const props = {
  initialLocale: "en",
  initialDisplayCurrency: "USD",
  initialProfile: {
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
  },
};

describe("UserSettingsShell — stacked accordion, no pills (Phase 10)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the four section triggers and NO pill chrome", () => {
    render(<UserSettingsShell {...props} />);
    // Section titles come from settings.user.sections.* (mock echoes the key).
    expect(screen.getByText("general")).toBeInTheDocument();
    expect(screen.getByText("profile")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("danger")).toBeInTheDocument();
    // The old pill carousel is gone.
    expect(screen.queryByTestId("settings-pills")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("settings-pill-general"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-pill-user")).not.toBeInTheDocument();
  });

  it("opens General by default (language + currency controls visible)", () => {
    render(<UserSettingsShell {...props} />);
    expect(screen.getByTestId("locale-select")).toBeInTheDocument();
    expect(screen.getByTestId("currency-picker")).toBeInTheDocument();
    expect(screen.getByText("locale.label")).toBeInTheDocument();
    expect(screen.getByText("display_currency.label")).toBeInTheDocument();
  });

  // UAT #10: the global settings column must span the same desktop width as the
  // in-budget Settings tab (max-w-[1280px] in budget-detail's TabPane), so the
  // card lines up with the header logo→profile span instead of the narrower 3xl.
  it("uses the 1280px desktop column to match the BDP Settings tab width", () => {
    const { container } = render(<UserSettingsShell {...props} />);
    const main = container.querySelector("main");
    expect(main?.className).toContain("max-w-[1280px]");
    expect(main?.className).not.toContain("max-w-3xl");
  });
});
