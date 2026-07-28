/**
 * wallet-delete-confirm.test.tsx — the delete confirm dialog focuses the
 * destructive action on open (260723-4) so a single Enter deletes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { WalletDeleteConfirm } from "@/components/budgeting/wallets-tab/wallet-delete-confirm";

describe("WalletDeleteConfirm", () => {
  it("focuses the delete action on open so Enter confirms", async () => {
    render(
      <WalletDeleteConfirm
        name="Cash"
        open
        onOpenChange={() => {}}
        onConfirm={vi.fn()}
      />,
    );
    const action = await screen.findByTestId("wallet-delete-confirm-action");
    expect(document.activeElement).toBe(action);
  });
});
