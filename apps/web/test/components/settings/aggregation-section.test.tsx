import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AggregationSection } from "@/components/settings/aggregation-section";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": { aggregation: { $put: vi.fn().mockResolvedValue({ ok: true }) } },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("AggregationSection", () => {
  it("renders the toggle reflecting includeInAggregation=true", () => {
    render(<AggregationSection budgetId="b1" includeInAggregation={true} />);
    const sw = screen.getByTestId("settings-aggregation-toggle");
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("renders the toggle reflecting includeInAggregation=false", () => {
    render(<AggregationSection budgetId="b1" includeInAggregation={false} />);
    const sw = screen.getByTestId("settings-aggregation-toggle");
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });
});
