/**
 * budget-rename-switcher.test.tsx — the header follows the rename (260809).
 *
 * The switcher in the header is a CLIENT component reading React Query's
 * ["active-budgets"], cached for 30 seconds. Renaming invalidated only the
 * budget's own detail query and called router.refresh(), which re-renders the
 * server tree — so the name in the dropdown stayed the old one until that
 * cache went stale on its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invalidateQueries, setQueryData, patchMock, refresh } = vi.hoisted(
  () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    patchMock: vi.fn().mockResolvedValue({ ok: true }),
    refresh: vi.fn(),
  }),
);

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries, setQueryData }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api-client", () => ({
  api: { budgets: { ":id": { $patch: patchMock } } },
}));
vi.mock("@/lib/query-persist", () => ({ persistNow: vi.fn() }));

import { BudgetIdentitySection } from "@/components/settings/budget-identity-section";

const renderIt = () =>
  render(
    <BudgetIdentitySection
      budgetId="b1"
      name="Old Name"
      defaultCurrency="PLN"
      hasTransactions={false}
    />,
  );

/** Type a new name into the inline cell and commit it. */
const rename = async (to: string) => {
  fireEvent.click(screen.getByTestId("budget-name-input"));
  const input = screen.getByTestId("budget-name-input") as HTMLInputElement;
  fireEvent.change(input, { target: { value: to } });
  fireEvent.blur(input);
  await waitFor(() => expect(patchMock).toHaveBeenCalled());
};

describe("renaming a budget", () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    setQueryData.mockClear();
    patchMock.mockClear().mockResolvedValue({ ok: true });
  });

  it("writes the new name straight into the switcher's cache", async () => {
    renderIt();
    await rename("New Name");
    const call = setQueryData.mock.calls.find(
      (c) => JSON.stringify(c[0]) === JSON.stringify(["active-budgets"]),
    );
    expect(call).toBeTruthy();
    // …and the updater renames THIS budget and leaves the others alone.
    const updater = call![1] as (
      old: { id: string; name: string }[],
    ) => { id: string; name: string }[];
    expect(
      updater([
        { id: "b1", name: "Old Name" },
        { id: "b2", name: "Other" },
      ]),
    ).toEqual([
      { id: "b1", name: "New Name" },
      { id: "b2", name: "Other" },
    ]);
  });

  it("…and asks the server to confirm it afterwards", async () => {
    renderIt();
    await rename("New Name");
    expect(
      invalidateQueries.mock.calls.some(
        (c) =>
          JSON.stringify((c[0] as { queryKey: unknown }).queryKey) ===
          JSON.stringify(["active-budgets"]),
      ),
    ).toBe(true);
  });

  it("survives a cache that has not been filled yet", async () => {
    renderIt();
    await rename("New Name");
    const call = setQueryData.mock.calls.find(
      (c) => JSON.stringify(c[0]) === JSON.stringify(["active-budgets"]),
    )!;
    const updater = call[1] as (old: unknown) => unknown;
    expect(updater(undefined)).toBeUndefined();
  });
});
