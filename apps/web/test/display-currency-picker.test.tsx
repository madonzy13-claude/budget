import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DisplayCurrencyPicker } from "../src/components/settings/display-currency-picker";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: { defaultValue?: string }) =>
    opts?.defaultValue ?? key,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock the API client — capture PUT calls
const mockPut = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.mock("../src/lib/api-client", () => ({
  api: {
    settings: {
      "display-currency": {
        $put: (args: { json: { currency: string } }) => mockPut(args),
      },
    },
  },
}));

describe("DisplayCurrencyPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the currency picker button", () => {
    render(<DisplayCurrencyPicker />);
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("renders all 8 fiat options when popover is open", async () => {
    render(<DisplayCurrencyPicker />);

    // Open the popover by clicking the trigger
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    await waitFor(() => {
      // All 8 currencies should be visible
      expect(screen.getByText(/USD/)).toBeTruthy();
      expect(screen.getByText(/EUR/)).toBeTruthy();
      expect(screen.getByText(/PLN/)).toBeTruthy();
      expect(screen.getByText(/GBP/)).toBeTruthy();
      expect(screen.getByText(/UAH/)).toBeTruthy();
      expect(screen.getByText(/CHF/)).toBeTruthy();
      expect(screen.getByText(/NOK/)).toBeTruthy();
      expect(screen.getByText(/SEK/)).toBeTruthy();
    });
  });

  it("fires PUT mutation against /api/settings/display-currency when currency is selected", async () => {
    render(<DisplayCurrencyPicker />);

    // Open the popover
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByTestId("currency-option-USD")).toBeTruthy();
    });

    // Select USD
    fireEvent.click(screen.getByTestId("currency-option-USD"));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith({
        json: { currency: "USD" },
      });
    });
  });

  it("shows initial currency if provided", () => {
    render(<DisplayCurrencyPicker initialCurrency="EUR" />);
    expect(screen.getByRole("combobox").textContent).toContain("EUR");
  });

  it("updates to newly selected currency after selection", async () => {
    render(<DisplayCurrencyPicker initialCurrency="USD" />);

    // Open
    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByTestId("currency-option-PLN")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("currency-option-PLN"));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith({
        json: { currency: "PLN" },
      });
    });
  });
});
