/**
 * account-danger-zone.test.tsx — Plan 10-06
 *
 * Account deletion is email-gated (checkpoint decision): typing the exact word
 * DELETE enables a confirm that calls authClient.deleteUser({ callbackURL }) —
 * Better Auth then emails a confirmation link; the cascade runs when it's clicked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });

vi.mock("@/lib/auth-client", () => ({
  authClient: { deleteUser: (...a: unknown[]) => deleteUser(...a) },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AccountDangerZone } from "@/components/settings/account-danger-zone";

describe("AccountDangerZone — typed-DELETE gated account deletion (USET-06)", () => {
  beforeEach(() => deleteUser.mockClear());

  it("only enables confirm after the exact word DELETE is typed, then calls deleteUser", async () => {
    render(<AccountDangerZone />);
    fireEvent.click(screen.getByTestId("delete-account-open"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    const confirm = screen.getByTestId("delete-account-confirm");
    expect(confirm).toBeDisabled();

    // Wrong casing stays disabled.
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "delete" },
    });
    expect(confirm).toBeDisabled();
    expect(deleteUser).not.toHaveBeenCalled();

    // Exact word enables it.
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "DELETE" },
    });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    await waitFor(() =>
      expect(deleteUser).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: expect.stringContaining("/sign-in"),
        }),
      ),
    );
  });
});
