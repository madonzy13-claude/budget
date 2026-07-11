/**
 * danger-zone-section.test.tsx — SETT-08
 *
 * Covers: owner/non-owner controls + typed-name gate for archive/delete.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";

const { mockPush, mockRefresh, mockArchive, mockSetQueryData, mockInvalidate } =
  vi.hoisted(() => ({
    mockPush: vi.fn(),
    mockRefresh: vi.fn(),
    mockArchive: vi.fn().mockResolvedValue({ ok: true }),
    mockSetQueryData: vi.fn(),
    mockInvalidate: vi.fn(),
  }));

// react-query mock — the component reads useQueryClient to drop the deleted
// budget from the home list cache (the infinite-loop fix).
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidate,
  }),
}));

// next-intl mock
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params?.name) return `${key}:${params.name}`;
    return key;
  },
}));

// next/navigation mock — useNavRouter wraps useRouter, so expose push + refresh.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
    prefetch: vi.fn(),
  }),
}));

// sonner mock
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// api-client mock
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": {
        archive: { $post: mockArchive },
        delete: { $post: vi.fn().mockResolvedValue({ ok: true }) },
        leave: { $post: vi.fn().mockResolvedValue({ ok: true }) },
      },
    },
  },
}));

const ownerProps = {
  budgetId: "budget-1",
  budgetName: "Family Budget",
  isOwner: true,
  isLastOwner: false,
};

const nonOwnerProps = {
  budgetId: "budget-1",
  budgetName: "Family Budget",
  isOwner: false,
  isLastOwner: false,
};

describe("DangerZoneSection — owner/non-owner controls + typed-name gate (SETT-08)", () => {
  it("owner sees no standalone Archive button (deleted under hood)", () => {
    // Archive was folded into Delete: typed-name confirm now triggers
    // an archive instead of a hard-delete. The standalone Archive CTA
    // was removed to keep the Danger Zone single-action.
    render(<DangerZoneSection {...ownerProps} />);
    expect(screen.queryByText("danger.archive_button")).not.toBeInTheDocument();
  });

  it("owner sees Delete Budget button", () => {
    render(<DangerZoneSection {...ownerProps} />);
    expect(screen.getByText("danger.delete_button")).toBeInTheDocument();
  });

  it("non-owner sees Leave budget only — no Archive or Delete", () => {
    render(<DangerZoneSection {...nonOwnerProps} />);
    expect(screen.getByText("danger.leave_button")).toBeInTheDocument();
    expect(screen.queryByText("danger.archive_button")).not.toBeInTheDocument();
    expect(screen.queryByText("danger.delete_button")).not.toBeInTheDocument();
  });

  it("Delete confirm button is disabled until typed name matches exactly", () => {
    render(<DangerZoneSection {...ownerProps} />);

    // Open the Delete dialog
    fireEvent.click(screen.getByText("danger.delete_button"));

    // Confirm button should be disabled initially (no input)
    const confirmBtn = screen.getByText("danger.delete_confirm");
    expect(confirmBtn).toBeDisabled();
  });

  it("Delete confirm button enabled when typed name matches budget name", () => {
    render(<DangerZoneSection {...ownerProps} />);

    // Open the Delete dialog
    fireEvent.click(screen.getByText("danger.delete_button"));

    // Type the budget name
    const input = screen.getByTestId("delete-confirm-input");
    fireEvent.change(input, { target: { value: "Family Budget" } });

    // Confirm button should now be enabled
    const confirmBtn = screen.getByText("danger.delete_confirm");
    expect(confirmBtn).not.toBeDisabled();
  });

  it("Delete confirm button remains disabled when typed name is wrong", () => {
    render(<DangerZoneSection {...ownerProps} />);

    // Open the Delete dialog
    fireEvent.click(screen.getByText("danger.delete_button"));

    // Type a wrong name
    const input = screen.getByTestId("delete-confirm-input");
    fireEvent.change(input, { target: { value: "Wrong Name" } });

    const confirmBtn = screen.getByText("danger.delete_confirm");
    expect(confirmBtn).toBeDisabled();
  });

  it("confirmed delete archives the budget AND refreshes the SSR budget list (260618)", async () => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    mockArchive.mockClear();

    render(<DangerZoneSection {...ownerProps} />);
    fireEvent.click(screen.getByText("danger.delete_button"));
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "Family Budget" },
    });
    fireEvent.click(screen.getByText("danger.delete_confirm"));

    await waitFor(() =>
      expect(mockArchive).toHaveBeenCalledWith({ param: { id: "budget-1" } }),
    );
    // router.refresh() invalidates the cached (app) layout so the header
    // switcher drops the archived budget instead of showing it stale.
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(mockPush.mock.calls[0]?.[0]).toBe("/");
  });

  it("drops the deleted budget from the home cache + last-visited so the sole-budget delete lands on the empty hero, not an infinite loop", async () => {
    mockSetQueryData.mockClear();
    mockInvalidate.mockClear();
    window.localStorage.setItem("last-budget-id", "budget-1");

    render(<DangerZoneSection {...ownerProps} />);
    fireEvent.click(screen.getByText("danger.delete_button"));
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "Family Budget" },
    });
    fireEvent.click(screen.getByText("danger.delete_confirm"));

    await waitFor(() => expect(mockSetQueryData).toHaveBeenCalled());
    const [key, updater] = mockSetQueryData.mock.calls[0] as [
      unknown,
      (old: { id: string }[]) => { id: string }[],
    ];
    expect(key).toEqual(["active-budgets"]);
    // The updater removes the deleted budget — so the SOLE budget becomes [] and
    // the home page renders the empty hero instead of re-opening the dead budget.
    expect(updater([{ id: "budget-1" }])).toEqual([]);
    expect(updater([{ id: "budget-1" }, { id: "keep" }])).toEqual([
      { id: "keep" },
    ]);
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["active-budgets"],
    });
    // last-visited pointing at the deleted budget is cleared.
    expect(window.localStorage.getItem("last-budget-id")).toBeNull();
  });
});
