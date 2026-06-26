/**
 * profile-section.test.tsx — Plan 10-03
 *
 * Profile section: edit name via authClient.updateUser({ name }) and email via
 * authClient.changeEmail({ newEmail }); a "pending verification" badge shows when
 * the session user's email is unverified.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
const changeEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
let sessionData: {
  user: { name: string; email: string; emailVerified: boolean };
} | null = {
  user: { name: "Ada", email: "ada@example.com", emailVerified: true },
};

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: sessionData, isPending: false }),
    updateUser: (...a: unknown[]) => updateUser(...a),
    changeEmail: (...a: unknown[]) => changeEmail(...a),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ProfileSection } from "@/components/settings/profile-section";

describe("ProfileSection — name + email edit (USET-04)", () => {
  beforeEach(() => {
    updateUser.mockClear();
    changeEmail.mockClear();
    sessionData = {
      user: { name: "Ada", email: "ada@example.com", emailVerified: true },
    };
  });

  it("saves a new name via authClient.updateUser", async () => {
    render(<ProfileSection />);
    const input = screen.getByTestId("profile-name-input");
    fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByTestId("profile-name-save"));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ name: "Ada Lovelace" }),
    );
  });

  it("changes email via authClient.changeEmail", async () => {
    render(<ProfileSection />);
    const input = screen.getByTestId("profile-email-input");
    fireEvent.change(input, { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByTestId("profile-email-save"));
    await waitFor(() =>
      expect(changeEmail).toHaveBeenCalledWith(
        expect.objectContaining({ newEmail: "new@example.com" }),
      ),
    );
  });

  it("shows a pending badge when the email is unverified", () => {
    sessionData = {
      user: { name: "Ada", email: "ada@example.com", emailVerified: false },
    };
    render(<ProfileSection />);
    expect(screen.getByTestId("profile-email-pending")).toBeInTheDocument();
  });

  it("does not show the pending badge when verified", () => {
    render(<ProfileSection />);
    expect(
      screen.queryByTestId("profile-email-pending"),
    ).not.toBeInTheDocument();
  });
});
