/**
 * sign-up-password.test.tsx — the password rule the form states must be the
 * one the server enforces, and every error has to be in the reader's language
 * (user, 261014).
 *
 * Reported: "Ks230768!" — nine characters — was refused with "password should
 * be minimum 8 chars", in English regardless of locale. Three separate faults
 * behind one message:
 *
 *   • the form checked `min(8)` while better-auth is configured
 *     `minPasswordLength: 10`, so a 9-character password passed the form and
 *     was refused by the server;
 *   • the refusal was shown by printing `result.error.message` straight
 *     through — better-auth's own English string, which quotes ITS default of
 *     8 and knows nothing of the configured 10. Hence a message that was both
 *     untranslated and wrong;
 *   • the same passthrough stood in for every other server error too.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { signUpEmail, signInEmail, push, refresh } = vi.hoisted(() => ({
  signUpEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  signInEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: (...a: unknown[]) => signUpEmail(...a) },
  signIn: { email: (...a: unknown[]) => signInEmail(...a) },
  authClient: {},
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}(${JSON.stringify(vals)})` : key,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { SignUpForm } from "@/components/auth/sign-up-form";
import { SignInForm } from "@/components/auth/sign-in-form";

function fill(password: string) {
  render(<SignUpForm defaultLocale="en" />);
  fireEvent.change(screen.getByLabelText("name.label"), {
    target: { value: "Alex" },
  });
  fireEvent.change(screen.getByLabelText("email.label"), {
    target: { value: "a@example.test" },
  });
  fireEvent.change(screen.getByLabelText("password.label"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: /submit|signup/i }));
}

describe("sign-up password rule", () => {
  beforeEach(() => {
    signUpEmail.mockClear();
    signUpEmail.mockResolvedValue({ data: {}, error: null });
    push.mockClear();
  });

  it("refuses a 9-character password before it reaches the server", async () => {
    fill("Ks230768!");
    await waitFor(() =>
      expect(
        screen.getByText(/validation\.password_min_length/),
      ).toBeTruthy(),
    );
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("states the length the server actually enforces", async () => {
    fill("Ks230768!");
    // Interpolated, so the copy cannot drift from the rule again.
    await waitFor(() =>
      expect(screen.getByText(/"min":10/)).toBeTruthy(),
    );
  });

  it("accepts a password that meets the real minimum", async () => {
    fill("Ks230768!a");
    await waitFor(() => expect(signUpEmail).toHaveBeenCalled());
  });
});

describe("sign-up server errors reach the reader translated", () => {
  beforeEach(() => {
    signUpEmail.mockClear();
    push.mockClear();
  });

  it("never prints better-auth's raw English string", async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: {
        code: "PASSWORD_TOO_SHORT",
        message: "password should be minimum 8 chars",
      },
    });
    fill("Ks230768!a");
    await waitFor(() =>
      expect(
        screen.getByText(/validation\.password_min_length/),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/minimum 8 chars/)).toBeNull();
  });

  it("falls back to the localized generic message, not the raw one", async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: { code: "SOMETHING_ELSE", message: "Internal server error" },
    });
    fill("Ks230768!a");
    await waitFor(() =>
      expect(screen.getByText("signup.error_generic")).toBeTruthy(),
    );
    expect(screen.queryByText("Internal server error")).toBeNull();
  });

  it("still names a duplicate email specifically", async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS", message: "User already exists" },
    });
    fill("Ks230768!a");
    await waitFor(() =>
      expect(screen.getByText("signup.error_email_in_use")).toBeTruthy(),
    );
  });
});

/**
 * The same passthrough stood in sign-in: anything the form did not recognise
 * was shown as better-auth's raw English (user, 261014, "check other error
 * messages as well").
 */
describe("sign-in server errors reach the reader translated", () => {
  beforeEach(() => {
    signInEmail.mockClear();
  });

  it("falls back to the localized generic message, not the raw one", async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: "SOMETHING_ELSE", message: "Internal server error" },
    });
    render(<SignInForm defaultLocale="en" />);
    fireEvent.change(screen.getByLabelText("email.label"), {
      target: { value: "a@example.test" },
    });
    fireEvent.change(screen.getByLabelText("password.label"), {
      target: { value: "Ks230768!a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit|signin/i }));
    await waitFor(() =>
      expect(screen.getByText("signin.error_generic")).toBeTruthy(),
    );
    expect(screen.queryByText("Internal server error")).toBeNull();
  });
});
