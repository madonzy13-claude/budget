/**
 * reset-password.test.tsx — Plan 10-05
 *
 * Consume page: reads ?token=, takes a new password (min length 10), calls
 * authClient.resetPassword({ newPassword, token }) and redirects to sign-in. A
 * password < 10 chars is rejected client-side (no call); a missing/expired token
 * shows the error + a link back to /forgot-password (T-10-08).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { resetPassword, push, mockToken } = vi.hoisted(() => ({
  resetPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
  push: vi.fn(),
  mockToken: { value: "abc" as string | null },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { resetPassword: (...a: unknown[]) => resetPassword(...a) },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (k: string) => (k === "token" ? mockToken.value : null),
  }),
  useRouter: () => ({ push }),
}));

import ResetPasswordPage from "@/app/[locale]/reset-password/page";

describe("ResetPasswordPage — consume token + set new password (USET-07)", () => {
  beforeEach(() => {
    resetPassword.mockClear();
    push.mockClear();
    mockToken.value = "abc";
  });

  it("sets a new password (>=10) and redirects to sign-in", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "longenough12" },
    });
    fireEvent.click(screen.getByTestId("reset-submit"));
    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ newPassword: "longenough12", token: "abc" }),
      ),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(expect.stringContaining("/sign-in")),
    );
  });

  it("rejects a password shorter than 10 chars without calling resetPassword", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByTestId("reset-submit"));
    expect(screen.getByTestId("reset-minlen")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("toggles password visibility with the eye button", () => {
    render(<ResetPasswordPage />);
    const input = screen.getByTestId("reset-password-input");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByTestId("reset-password-toggle"));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByTestId("reset-password-toggle"));
    expect(input).toHaveAttribute("type", "password");
  });

  it("shows an error with a link to /forgot-password when the token is missing", () => {
    mockToken.value = null;
    render(<ResetPasswordPage />);
    expect(screen.getByTestId("reset-error")).toBeInTheDocument();
    const link = screen.getByTestId("reset-request-new");
    expect(link.getAttribute("href")).toContain("/forgot-password");
  });
});
