import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AggregationSection } from "@/components/settings/aggregation-section";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));
vi.mock("@/lib/query-persist", () => ({ persistNow: vi.fn() }));
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

  it("renders the share as '70%' text (inline-edit, like Name)", () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={70}
      />,
    );
    // Resting state: a text cell showing "70%", NOT a number input.
    const cell = screen.getByTestId("settings-aggregation-share");
    expect(cell.textContent).toContain("70%");
    expect(cell.querySelector("input")).toBeNull();
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

  function editShare(value: string) {
    // Tap the "N%" cell → an input appears; type the bare number; Enter commits.
    fireEvent.click(screen.getByTestId("settings-aggregation-share"));
    const input = screen
      .getByTestId("settings-aggregation-share-editor")
      .querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
  }

  it("PUTs the new share_pct on commit, clamped to 0..100", async () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={50}
      />,
    );
    editShare("150");
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith({
        param: { id: "b1" },
        json: { included: true, share_pct: 100 },
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("settings-aggregation-share").textContent,
      ).toContain("100%"),
    );
  });

  it("accepts a decimal value with a comma (33,5 → 33.5)", async () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={100}
      />,
    );
    editShare("33,5");
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith({
        param: { id: "b1" },
        json: { included: true, share_pct: 33.5 },
      }),
    );
  });

  it("does not PUT when the share value is unchanged", async () => {
    render(
      <AggregationSection
        budgetId="b1"
        includeInAggregation={true}
        sharePct={50}
      />,
    );
    fireEvent.click(screen.getByTestId("settings-aggregation-share"));
    const input = screen
      .getByTestId("settings-aggregation-share-editor")
      .querySelector("input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });
    await Promise.resolve();
    expect(putMock).not.toHaveBeenCalled();
  });
});
