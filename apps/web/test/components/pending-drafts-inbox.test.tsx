/**
 * pending-drafts-inbox.test.tsx — Vitest+RTL tests for PendingDraftsInbox.
 * Per UI-SPEC: each draft row shows 3 action buttons (Confirm / Edit & confirm / Skip).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => {
    const map: Record<string, string> = {
      "drafts.empty": "No pending drafts.",
      "drafts.confirmButton": "Confirm transaction",
      "drafts.editConfirmButton": "Edit & confirm",
      "drafts.skipButton": "Skip this period",
    };
    return map[key] ?? key;
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const { PendingDraftsInbox } =
  await import("../../src/components/budgeting/pending-drafts-inbox");

const mockDrafts = [
  {
    id: "draft-1",
    ruleId: "rule-1",
    dueDate: "2026-06-01",
    amount: "1500.00",
    currency: "USD",
    kind: "EXPENSE",
    note: "Rent",
  },
  {
    id: "draft-2",
    ruleId: "rule-2",
    dueDate: "2026-06-15",
    amount: "50.00",
    currency: "USD",
    kind: "EXPENSE",
    note: null,
  },
];

describe("PendingDraftsInbox", () => {
  it("renders empty state when no drafts", () => {
    render(<PendingDraftsInbox drafts={[]} />);
    expect(screen.queryByText("No pending drafts.")).toBeTruthy();
  });

  it("renders 3 action buttons per draft row (Confirm / Edit & confirm / Skip)", () => {
    render(<PendingDraftsInbox drafts={mockDrafts} />);
    const confirmBtns = screen.getAllByRole("button", {
      name: /Confirm transaction/i,
    });
    const editBtns = screen.getAllByRole("button", { name: /Edit & confirm/i });
    const skipBtns = screen.getAllByRole("button", {
      name: /Skip this period/i,
    });
    expect(confirmBtns.length).toBe(2);
    expect(editBtns.length).toBe(2);
    expect(skipBtns.length).toBe(2);
  });

  it("calls onConfirm with draft id when Confirm is clicked", () => {
    const onConfirm = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PendingDraftsInbox
        drafts={mockDrafts}
        onConfirm={onConfirm}
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    const firstConfirm = screen.getAllByRole("button", {
      name: /Confirm transaction/i,
    })[0];
    fireEvent.click(firstConfirm);
    expect(onConfirm).toHaveBeenCalledWith("draft-1");
  });
});
