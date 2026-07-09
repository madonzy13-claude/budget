/**
 * forgot-reset-password.test.tsx — Plan 10-05 (USET-07)
 *
 * Covers the two logged-out password-reset behaviors the @forgot-password e2e
 * leaves untested:
 *   (a) /forgot-password ALWAYS shows the same neutral success — registered or
 *       not — so the form can't enumerate accounts (T-10-07).
 *   (b) /reset-password enforces a 10-char minimum client-side before it ever
 *       calls resetPassword, and a missing token shows the expired error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const requestPasswordReset = vi
  .fn()
  .mockResolvedValue({ data: {}, error: null });
const resetPassword = vi.fn().mockResolvedValue({ data: {}, error: null });
const push = vi.fn();

let token: string | null = "tok-123";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
    resetPassword: (...a: unknown[]) => resetPassword(...a),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (k: string) => (k === "token" ? token : null),
  }),
  useRouter: () => ({ push }),
}));

import ForgotPasswordPage from "@/app/[locale]/forgot-password/page";
import ResetPasswordPage from "@/app/[locale]/reset-password/page";

describe("ForgotPasswordPage — neutral success (no account enumeration)", () => {
  beforeEach(() => {
    requestPasswordReset.mockClear();
    requestPasswordReset.mockResolvedValue({ data: {}, error: null });
  });

  it("shows the same neutral success for a registered email", async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByTestId("forgot-email"), {
      target: { value: "registered@example.com" },
    });
    fireEvent.click(screen.getByTestId("forgot-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("forgot-success")).toBeTruthy(),
    );
  });

  it("shows the IDENTICAL neutral success when the request errors (unregistered)", async () => {
    requestPasswordReset.mockRejectedValueOnce(new Error("nope"));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByTestId("forgot-email"), {
      target: { value: "ghost@example.com" },
    });
    fireEvent.click(screen.getByTestId("forgot-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("forgot-success")).toBeTruthy(),
    );
    // never leaks the email's registration state — same success node, no error node
    expect(screen.queryByTestId("forgot-error")).toBeNull();
  });
});

describe("ResetPasswordPage — 10-char minimum + token guard", () => {
  beforeEach(() => {
    resetPassword.mockClear();
    push.mockClear();
    token = "tok-123";
  });

  it("rejects a sub-10-char password without calling resetPassword", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "short9999" }, // 9 chars
    });
    fireEvent.click(screen.getByTestId("reset-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("reset-minlen")).toBeTruthy(),
    );
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("accepts a >=10-char password, calls resetPassword with the token, redirects to sign-in", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "brandnewpass123" },
    });
    fireEvent.click(screen.getByTestId("reset-submit"));
    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          newPassword: "brandnewpass123",
          token: "tok-123",
        }),
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/sign-in"));
  });

  it("shows the expired error when the token is missing", () => {
    token = null;
    render(<ResetPasswordPage />);
    expect(screen.getByTestId("reset-error")).toBeTruthy();
  });
});
