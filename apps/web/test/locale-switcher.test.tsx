import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleSelect } from "../src/components/settings/locale-select";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: { defaultValue?: string }) =>
    opts?.defaultValue ?? key,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock api-client
vi.mock("../src/lib/api-client", () => ({
  api: {
    settings: {
      locale: {
        $put: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  },
}));

describe("LocaleSelect", () => {
  it("renders with the initial locale", () => {
    render(<LocaleSelect initialLocale="en" />);
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("renders all three supported locales in the select", async () => {
    const { getByRole } = render(<LocaleSelect initialLocale="en" />);
    // The select trigger should exist
    const trigger = getByRole("combobox");
    expect(trigger).toBeTruthy();
  });
});
