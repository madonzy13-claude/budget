/**
 * danger-zone-section.test.tsx — SETT-08
 *
 * Covers: owner/non-owner controls + typed-name gate for archive/delete.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";

// next-intl mock
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params?.name) return `${key}:${params.name}`;
    return key;
  },
}));

// next/navigation mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
        archive: { $post: vi.fn().mockResolvedValue({ ok: true }) },
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
  it("owner sees Archive Budget button", () => {
    render(<DangerZoneSection {...ownerProps} />);
    expect(screen.getByText("danger.archive_button")).toBeInTheDocument();
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
});
