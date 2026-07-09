/**
 * forgot-password.test.tsx — Plan 10-05
 *
 * Logged-out request-reset page: submitting an email fires
 * authClient.requestPasswordReset and then ALWAYS shows the same neutral success
 * (no account enumeration, T-10-07).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { requestPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

import ForgotPasswordPage from "@/app/[locale]/forgot-password/page";

describe("ForgotPasswordPage — request reset link (USET-07)", () => {
  beforeEach(() => requestPasswordReset.mockClear());

  it("requests a reset link and shows a neutral success", async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByTestId("forgot-email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByTestId("forgot-submit"));
    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "ada@example.com",
          redirectTo: expect.stringContaining("/reset-password"),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("forgot-success")).toBeInTheDocument(),
    );
  });
});
