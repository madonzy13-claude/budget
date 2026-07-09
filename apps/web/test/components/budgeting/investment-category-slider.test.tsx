/**
 * investment-category-slider.test.tsx — r33 smart Investments edit form.
 *
 * - Smart is DISABLED with a hint when the budget has no income.
 * - With income, choosing Manual + saving PATCHes the mode and POSTs the limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TestQueryProvider,
  makeTestQueryClient,
} from "../../setup/query-client";

const fetchMock = vi.fn();
const writeMock = vi.fn();

vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));
vi.mock("@/lib/offline-write", () => ({
  clientApiWrite: (...args: unknown[]) => writeMock(...args),
  isOfflineWriteError: () => false,
}));
vi.mock("@/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => () => {},
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { InvestmentCategorySlider } from "@/components/budgeting/investment-category-slider";

const initial = {
  categoryId: "cat-inv",
  name: "Investments",
  plannedCents: "50000",
  colorKey: "green" as string | null,
  investmentLimitMode: "smart" as string | null,
};

function renderSlider() {
  return render(
    <TestQueryProvider client={makeTestQueryClient()}>
      <InvestmentCategorySlider
        open
        onOpenChange={() => {}}
        budgetId="b1"
        budgetCurrency="USD"
        month="2026-07"
        initial={initial}
      />
    </TestQueryProvider>,
  );
}

function statusResponse(hasIncome: boolean, mode: string | null) {
  return {
    ok: true,
    json: async () => ({
      category: { investmentLimitMode: mode },
      hasIncome,
      exists: true,
    }),
  };
}

describe("InvestmentCategorySlider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    writeMock.mockReset();
    writeMock.mockResolvedValue({ ok: true });
  });

  it("disables Smart and shows a hint when there is no income", async () => {
    fetchMock.mockResolvedValue(statusResponse(false, "smart"));
    renderSlider();
    await waitFor(() =>
      expect(screen.getByTestId("invest-smart-hint")).toBeTruthy(),
    );
    expect(
      (screen.getByTestId("invest-mode-smart") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("with income, Manual save PATCHes the mode and POSTs the limit", async () => {
    fetchMock.mockResolvedValue(statusResponse(true, "smart"));
    renderSlider();
    // Wait for the income gate to open (Smart enabled).
    await waitFor(() =>
      expect(
        (screen.getByTestId("invest-mode-smart") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    await userEvent.click(screen.getByTestId("invest-mode-manual"));
    await userEvent.click(screen.getByTestId("invest-cat-save"));

    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    const urls = writeMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain("/budgets/b1/investment-category/limit-mode");
    expect(urls.some((u) => u.endsWith("/categories/cat-inv/limits"))).toBe(
      true,
    );
    // limit-mode body carries mode=manual.
    const modeCall = writeMock.mock.calls.find(
      (c) => (c[0] as string).endsWith("/limit-mode"),
    )!;
    expect(JSON.parse((modeCall[1] as { body: string }).body).mode).toBe(
      "manual",
    );
  });
});
