/**
 * budget-identity-currency.test.tsx — Phase 14 (D-01, UI-SPEC §4): the owner
 * can change the budget currency at any time, behind a confirm dialog; caches
 * scoped to the budget refresh afterwards. Members see it read-only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { patch, invalidateQueries, toast } = vi.hoisted(() => ({
  patch: vi.fn(),
  invalidateQueries: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, string>) => (v ? `${k}:${Object.values(v).join("|")}` : k),
  useLocale: () => "en",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries, setQueryData: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api-client", () => ({ api: { budgets: { ":id": { $patch: (...a: unknown[]) => patch(...a) } } } }));
vi.mock("@radix-ui/react-alert-dialog", async (orig) => {
  const actual = await orig<typeof import("@radix-ui/react-alert-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

import { BudgetIdentitySection } from "@/components/settings/budget-identity-section";

const pick = (ccy: string) =>
  fireEvent.change(screen.getByTestId("currency-picker-native"), { target: { value: ccy } });

describe("Budget currency change", () => {
  beforeEach(() => {
    patch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    invalidateQueries.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 1 });
  });

  it("an owner can change it even with transactions", () => {
    render(<BudgetIdentitySection budgetId="b1" name="H" defaultCurrency="PLN" hasTransactions isOwner />);
    expect(screen.getByTestId("currency-picker-native")).toBeTruthy();
  });

  it("a member sees it read-only", () => {
    render(<BudgetIdentitySection budgetId="b1" name="H" defaultCurrency="PLN" hasTransactions isOwner={false} />);
    expect(screen.queryByTestId("currency-picker-native")).toBeNull();
    expect(screen.getByText("PLN")).toBeTruthy();
  });

  it("cancel keeps the current currency and sends nothing", () => {
    render(<BudgetIdentitySection budgetId="b1" name="H" defaultCurrency="PLN" hasTransactions />);
    pick("EUR");
    expect(screen.getByText("identity.currency_confirm_title:EUR")).toBeTruthy();
    fireEvent.click(screen.getByText("identity.currency_confirm_cancel:PLN"));
    expect(patch).not.toHaveBeenCalled();
    expect((screen.getByTestId("currency-picker-native") as HTMLSelectElement).value).toBe("PLN");
  });

  it("confirm saves and refreshes every query of this budget", async () => {
    render(<BudgetIdentitySection budgetId="b1" name="H" defaultCurrency="PLN" hasTransactions />);
    pick("EUR");
    fireEvent.click(screen.getByText("identity.currency_confirm_cta"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith({ param: { id: "b1" }, json: { default_currency: "EUR" } }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("identity.currency_saved"));
    const predicates = invalidateQueries.mock.calls.map((c) => c[0]?.predicate).filter(Boolean);
    expect(predicates.some((p) => p({ queryKey: ["spendings-summary", "b1", "2026-05"] }))).toBe(true);
    expect(predicates.some((p) => p({ queryKey: ["budget", "b1", "reserves"] }))).toBe(true);
    expect(predicates.some((p) => p({ queryKey: ["budget", "other", "reserves"] }))).toBe(false);
  });

  it("an error reverts the picker", async () => {
    patch.mockResolvedValue({ ok: false, json: async () => ({ error: "update_failed" }) });
    render(<BudgetIdentitySection budgetId="b1" name="H" defaultCurrency="PLN" hasTransactions />);
    pick("EUR");
    fireEvent.click(screen.getByText("identity.currency_confirm_cta"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect((screen.getByTestId("currency-picker-native") as HTMLSelectElement).value).toBe("PLN");
  });
});
