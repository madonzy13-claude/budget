/**
 * security-section.test.tsx — Plan 10-04
 *
 * Email-gated password change: the button fires authClient.requestPasswordReset
 * to the account's OWN address with a redirectTo the shared /reset-password page
 * (no new-password entry here). The section also embeds the sessions list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const requestPasswordReset = vi
  .fn()
  .mockResolvedValue({ data: {}, error: null });

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
    // SessionsList fetch on mount + its actions
    listSessions: vi.fn().mockResolvedValue({ data: [], error: null }),
    getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    revokeSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
    revokeOtherSessions: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SecuritySection } from "@/components/settings/security-section";

describe("SecuritySection — email-gated password change (USET-05)", () => {
  beforeEach(() => requestPasswordReset.mockClear());

  it("emails a reset link to the account address with a /reset-password redirect", async () => {
    render(<SecuritySection email="ada@example.com" />);
    fireEvent.click(screen.getByTestId("change-password-button"));
    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "ada@example.com",
          redirectTo: expect.stringContaining("/reset-password"),
        }),
      ),
    );
  });
});
