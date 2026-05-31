/**
 * cushion-section.test.tsx — Phase 7 plan 09 (TASK-04)
 *
 * Vitest + RTL coverage for the cushion_target_months input and
 * live cushion-summary preview added in 07-09. The PATCH route
 * itself ships in 07-07; we mock api.budgets[":id"].$patch to
 * isolate UI behavior.
 *
 * Covers:
 *  - Months input rendered when master toggle ON.
 *  - Months input hidden when master toggle OFF.
 *  - Edit + blur with valid value → PATCH fired + queryClient.invalidateQueries.
 *  - Edit + blur with invalid value (0) → inline error, NO PATCH.
 *  - Preview shimmer while query loading.
 *  - Preview formatted amounts on success (shortfall > 0 → trading-down styling).
 *  - Preview "met" styling when shortfall ≤ 0 (trading-up).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "../../setup/query-client";

const patchMock = vi.fn();
const invalidateMock = vi.fn();
const useQueryMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": {
        $patch: (...args: unknown[]) => patchMock(...args),
      },
    },
  },
}));

vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(),
  extractBudgetIdFromPath: () => "budget-1",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useQueryClient: () => ({ invalidateQueries: invalidateMock }),
  };
});

import { CushionSection } from "@/components/settings/cushion-section";

const renderCushionSection = (
  overrides: Partial<{
    initialCushionTargetMonths: number;
    cushionEnabled: boolean;
  }> = {},
) =>
  render(
    <TestQueryProvider>
      <CushionSection
        budgetId="budget-1"
        cushionEnabled={overrides.cushionEnabled ?? true}
        cushionModeEnabled={false}
        cushionTargetMonths={overrides.initialCushionTargetMonths ?? 6}
        budgetCurrency="USD"
      />
    </TestQueryProvider>,
  );

describe("CushionSection (Phase 7-09) cushion_target_months + preview", () => {
  beforeEach(() => {
    patchMock.mockReset();
    invalidateMock.mockReset();
    useQueryMock.mockReset();
    patchMock.mockResolvedValue({ ok: true });
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
  });

  it("months input is rendered when master toggle is ON", () => {
    renderCushionSection({ cushionEnabled: true });
    const input = document.getElementById(
      "cushion-target-months",
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.value).toBe("6");
  });

  it("months input is hidden when master toggle is OFF", () => {
    renderCushionSection({ cushionEnabled: false });
    const input = document.getElementById("cushion-target-months");
    expect(input).toBeNull();
  });

  it("edit + blur with valid value fires PATCH with cushion_target_months", async () => {
    const user = userEvent.setup();
    renderCushionSection({ initialCushionTargetMonths: 6 });
    const input = document.getElementById(
      "cushion-target-months",
    ) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "12");
    fireEvent.blur(input);

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect(patchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: { id: "budget-1" },
        json: { cushion_target_months: 12 },
      }),
    );
    expect(invalidateMock).toHaveBeenCalledWith({
      queryKey: ["cushion-summary", "budget-1"],
    });
  });

  it("edit + blur with value=0 shows inline error and does NOT PATCH", async () => {
    const user = userEvent.setup();
    renderCushionSection({ initialCushionTargetMonths: 6 });
    const input = document.getElementById(
      "cushion-target-months",
    ) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "0");
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });
    expect(patchMock).not.toHaveBeenCalled();
    expect(
      document.getElementById("cushion-target-error"),
    ).not.toBeNull();
  });

  it("edit + blur with value=61 shows inline error and does NOT PATCH", async () => {
    const user = userEvent.setup();
    renderCushionSection({ initialCushionTargetMonths: 6 });
    const input = document.getElementById(
      "cushion-target-months",
    ) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "61");
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("preview line shows shimmer while query is loading", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    renderCushionSection();
    const preview = document.getElementById("cushion-preview");
    expect(preview).not.toBeNull();
    expect(preview?.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("preview shows shortfall>0 with trading-down styling", () => {
    useQueryMock.mockReturnValue({
      data: {
        required_cents: "180000",
        actual_cents: "100000",
        shortfall_cents: "80000",
        currency: "USD",
        enabled: true,
        target_months: 6,
      },
      isLoading: false,
      isError: false,
    });
    renderCushionSection();
    const preview = document.getElementById("cushion-preview");
    expect(preview?.textContent).toMatch(/cushion\.preview/);
    expect(preview?.innerHTML).toContain("trading-down");
  });

  it("preview shows shortfall≤0 with trading-up styling (preview met)", () => {
    useQueryMock.mockReturnValue({
      data: {
        required_cents: "100000",
        actual_cents: "120000",
        shortfall_cents: "0",
        currency: "USD",
        enabled: true,
        target_months: 6,
      },
      isLoading: false,
      isError: false,
    });
    renderCushionSection();
    const preview = document.getElementById("cushion-preview");
    expect(preview?.textContent).toMatch(/cushion\.previewMet/);
    expect(preview?.innerHTML).toContain("trading-up");
  });

  it("preview shows error fallback when query errors", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    renderCushionSection();
    const preview = document.getElementById("cushion-preview");
    expect(preview?.textContent).toMatch(/cushion\.previewError/);
  });
});
