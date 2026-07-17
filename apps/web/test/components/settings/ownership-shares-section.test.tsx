import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OwnershipSharesSection } from "@/components/settings/ownership-shares-section";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": {
        members: { shares: { $put: vi.fn().mockResolvedValue({ ok: true }) } },
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const members = [
  { userId: "a", name: "Ann", pct: 60 },
  { userId: "b", name: "Bob", pct: 40 },
];

describe("OwnershipSharesSection", () => {
  it("save is enabled at total 100 and disabled otherwise", () => {
    render(<OwnershipSharesSection budgetId="b1" members={members} />);
    const save = screen.getByTestId("ownership-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    const bob = screen.getByTestId("ownership-input-b") as HTMLInputElement;
    fireEvent.change(bob, { target: { value: "50" } }); // total 110
    expect(
      (screen.getByTestId("ownership-save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("ownership-total").textContent).toContain("110");
  });
});
