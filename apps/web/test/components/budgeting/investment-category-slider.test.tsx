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

function renderSlider(overrides: Partial<typeof initial> = {}) {
  return render(
    <TestQueryProvider client={makeTestQueryClient()}>
      <InvestmentCategorySlider
        open
        onOpenChange={() => {}}
        budgetId="b1"
        budgetCurrency="USD"
        month="2026-07"
        initial={{ ...initial, ...overrides }}
      />
    </TestQueryProvider>,
  );
}

/** aria-pressed on a mode button, as the DOM reports it. */
const pressed = (mode: string) =>
  screen.getByTestId(`invest-mode-${mode}`).getAttribute("aria-pressed");

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

  it("offers a third mode: no limit", async () => {
    // Investments used to be forced to carry a limit — 'smart' if the member
    // never chose, which the money forecast could not see and therefore read
    // as a plan of zero. 'none' is the same no-limit every other category has.
    fetchMock.mockResolvedValue(statusResponse(true, "none"));
    renderSlider();
    // Inside waitFor: the button renders immediately, but the authoritative
    // mode only arrives with the status query.
    await waitFor(() => expect(pressed("none")).toBe("true"));
  });

  it("defaults to no limit when the category has no mode yet", async () => {
    // A category created before the mode existed, or one just created: 'none'
    // is the default now, and the dialog must not silently show 'smart'.
    // Nothing on the server AND nothing on the row — the only case that is
    // really "no mode yet". A stored 'smart' is still honoured.
    fetchMock.mockResolvedValue(statusResponse(true, null));
    renderSlider({ investmentLimitMode: null });
    await waitFor(() => expect(pressed("none")).toBe("true"));
  });

  it("hides the manual amount field while no limit is selected", async () => {
    // Nothing to type: the category is unbounded, exactly like a no-limit
    // normal category.
    fetchMock.mockResolvedValue(statusResponse(true, "none"));
    renderSlider();
    await waitFor(() => expect(pressed("none")).toBe("true"));
    expect(screen.queryByTestId("invest-manual-readout")).toBeNull();
  });

  it("saving no limit PATCHes mode 'none'", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(statusResponse(true, "manual"));
    renderSlider();
    await waitFor(() => expect(pressed("manual")).toBe("true"));
    await user.click(screen.getByTestId("invest-mode-none"));
    await user.click(screen.getByTestId("invest-cat-save"));
    await waitFor(() => {
      // By URL — the save PATCHes the category itself first (name + colour),
      // so "the first PATCH" is the wrong call to look at.
      const patched = writeMock.mock.calls.find((c) =>
        String(c[0]).includes("/limit-mode"),
      );
      expect(String(patched?.[1]?.body ?? "")).toContain('"mode":"none"');
    });
  });

  it("lays the colour swatches out in one 10-per-row grid", async () => {
    // They were fixed h-8 w-8 in a flex-wrap, which spilled onto a third row on
    // a phone. The normal category picker moved to this grid (user, 260820);
    // this dialog was missed.
    fetchMock.mockResolvedValue(statusResponse(true, "none"));
    renderSlider();
    await waitFor(() =>
      expect(screen.getByTestId("invest-color-green")).toBeTruthy(),
    );
    const grid = screen.getByTestId("invest-color-green").parentElement!;
    expect(grid.className).toContain("grid-cols-10");
    expect(screen.getByTestId("invest-color-green").className).not.toContain(
      "w-8",
    );
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
    const modeCall = writeMock.mock.calls.find((c) =>
      (c[0] as string).endsWith("/limit-mode"),
    )!;
    expect(JSON.parse((modeCall[1] as { body: string }).body).mode).toBe(
      "manual",
    );
  });
});
