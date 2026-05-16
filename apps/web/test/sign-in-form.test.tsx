import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignInForm } from "../src/components/auth/sign-in-form";
import { signIn } from "../src/lib/auth-client";

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

// Shared router spies so tests can assert on navigation.
const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
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
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
  });

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

  it("redirects to the locale home on successful sign-in, not the non-existent /budgets route", async () => {
    render(<SignInForm locale="en" />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "Password1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith("/en");
    expect(pushMock).not.toHaveBeenCalledWith("/en/budgets");
  });

  it("sets the budget-locale cookie and redirects to the account locale", async () => {
    (signIn.email as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { locale: "uk" } },
      error: null,
    });
    render(<SignInForm locale="en" />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "Password1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith("/uk");
    expect(document.cookie).toContain("budget-locale=uk");
  });
});
