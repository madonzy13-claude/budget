/**
 * limit-editor.test.tsx — Vitest+RTL tests for LimitEditor.
 * Focus: form renders, submits POST to /api/categories/:id/limits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LimitEditor } from "../../src/components/budgeting/limit-editor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      "normalAmount": "Normal limit",
      "cushionAmount": "Cushion limit",
      "effectiveFrom": "Effective from",
      "save": "Save limits",
      "currency": "Currency",
    };
    return map[key] ?? key;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock CurrencyPicker
vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      data-testid="currency-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="EUR">EUR</option>
      <option value="USD">USD</option>
    </select>
  ),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("LimitEditor", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders normal and cushion amount fields", () => {
    render(<LimitEditor categoryId="cat-1" />);
    expect(screen.getByText("Normal limit")).toBeInTheDocument();
    expect(screen.getByText("Cushion limit")).toBeInTheDocument();
    expect(screen.getByText("Effective from")).toBeInTheDocument();
  });

  it("pre-fills from existingLimit", () => {
    render(
      <LimitEditor
        categoryId="cat-1"
        existingLimit={{
          id: "lim-1",
          categoryId: "cat-1",
          normalAmount: "50000",
          normalCurrency: "EUR",
          cushionAmount: "60000",
          cushionCurrency: "EUR",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
        }}
      />
    );
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(50000);
    expect(inputs[1]).toHaveValue(60000);
  });

  it("submits POST with correct payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "lim-new",
        categoryId: "cat-1",
        normalAmount: "10000",
        normalCurrency: "EUR",
        cushionAmount: "12000",
        cushionCurrency: "EUR",
        effectiveFrom: "2026-05-01",
        effectiveTo: null,
      }),
    });

    render(<LimitEditor categoryId="cat-1" />);

    const [normalInput, cushionInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(normalInput, { target: { value: "10000" } });
    fireEvent.change(cushionInput, { target: { value: "12000" } });

    fireEvent.click(screen.getByRole("button", { name: /save limits/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/categories/cat-1/limits",
        expect.objectContaining({ method: "POST" })
      );
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.normalAmount).toBe("10000");
    expect(body.cushionAmount).toBe("12000");
  });
});
