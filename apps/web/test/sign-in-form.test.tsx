import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInForm } from "../src/components/auth/sign-in-form";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) => (key: string, opts?: { defaultValue?: string }) => {
      // Return the EN message key value for testing
      const messages: Record<string, string> = {
        "email.label": "Email address",
        "password.label": "Password",
        "signin.cta": "Sign in",
        "signin.heading": "Welcome back",
        loading: "Signing in...",
        "email.placeholder": "you@example.com",
        "signin.error_generic": "Sign in failed.",
      };
      const fullKey = namespace ? `${key}` : key;
      return messages[fullKey] ?? opts?.defaultValue ?? key;
    },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Mock auth client
vi.mock("../src/lib/auth-client", () => ({
  signIn: {
    email: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  authClient: {
    sendVerificationEmail: vi.fn(),
  },
  signUp: { email: vi.fn() },
  signOut: vi.fn(),
  useSession: vi.fn(() => ({ data: null, isPending: false })),
  sendVerificationEmail: vi.fn(),
  forgetPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

describe("SignInForm", () => {
  it("renders without crashing", () => {
    const { container } = render(<SignInForm locale="en" />);
    expect(container.querySelector("form")).toBeTruthy();
  });

  it("renders email and password fields", () => {
    render(<SignInForm locale="en" />);
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
  });

  it("renders sign in CTA button", () => {
    render(<SignInForm locale="en" />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("submit button is initially enabled", () => {
    render(<SignInForm locale="en" />);
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();
  });
});
