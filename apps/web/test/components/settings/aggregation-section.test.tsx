import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AggregationSection } from "@/components/settings/aggregation-section";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
const putMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": { aggregation: { $put: putMock } },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("AggregationSection", () => {
  beforeEach(() => {
    putMock.mockClear();
    putMock.mockResolvedValue({ ok: true });
  });

  it("renders the toggle reflecting includeInAggregation=true", () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={100}
      />,
    );
    const sw = screen.getByTestId("settings-aggregation-toggle");
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("renders the toggle reflecting includeInAggregation=false", () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={false}
        sharePct={100}
      />,
    );
    const sw = screen.getByTestId("settings-aggregation-toggle");
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("hides the share field when include is OFF", () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={false}
        sharePct={70}
      />,
    );
    expect(screen.queryByTestId("settings-aggregation-share")).toBeNull();
  });

  it("shows the share field reflecting sharePct when include is ON", () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={70}
      />,
    );
    const input = screen.getByTestId(
      "settings-aggregation-share",
    ) as HTMLInputElement;
    expect(input.value).toBe("70");
  });

  it("PUTs included+share_pct when the toggle flips", async () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={false}
        sharePct={55}
      />,
    );
    const sw = screen.getByTestId("settings-aggregation-toggle");
    fireEvent.click(sw);
    await Promise.resolve();
    await Promise.resolve();
    expect(putMock).toHaveBeenCalledWith({
      param: { id: "b1" },
      json: { included: true, share_pct: 55 },
    });
  });

  it("PUTs the new share_pct on blur, clamped to 0..100", async () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={50}
      />,
    );
    const input = screen.getByTestId(
      "settings-aggregation-share",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.blur(input);
    await Promise.resolve();
    await Promise.resolve();
    expect(putMock).toHaveBeenCalledWith({
      param: { id: "b1" },
      json: { included: true, share_pct: 100 },
    });
    expect(input.value).toBe("100");
  });

  it("does not PUT on blur when the share value is unchanged", async () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={50}
      />,
    );
    const input = screen.getByTestId("settings-aggregation-share");
    fireEvent.blur(input);
    await Promise.resolve();
    expect(putMock).not.toHaveBeenCalled();
  });
});
