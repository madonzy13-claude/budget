import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
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

// Shared router spies — kept available for any future router.push
// assertions, but the sign-in form now navigates via window.location
// (hard navigation so the just-set session cookie is on the wire when
// the next request fires). We track the hard navigation by stubbing
// the location.href setter and asserting on its calls.
const { pushMock, refreshMock, hrefSetter } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  hrefSetter: vi.fn(),
}));

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

// happy-dom's `window.location` is a regular object; redefine `href`
// with a setter spy so the SignInForm's `window.location.href = "/..."`
// hard-navigation is captured without actually leaving the test page.
beforeEach(() => {
  const loc = window.location;
  Object.defineProperty(loc, "href", {
    configurable: true,
    get: () => "http://localhost/",
    set: hrefSetter,
  });
});

describe("SignInForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    hrefSetter.mockClear();
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

  it("hard-navigates to the locale home on successful sign-in, not the non-existent /budgets route", async () => {
    render(<SignInForm locale="en" />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "Password1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(hrefSetter).toHaveBeenCalled());
    expect(hrefSetter).toHaveBeenCalledWith("/en");
    expect(hrefSetter).not.toHaveBeenCalledWith("/en/budgets");
  });

  it("sets the budget-locale cookie and hard-navigates to the account locale", async () => {
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

    await waitFor(() => expect(hrefSetter).toHaveBeenCalled());
    expect(hrefSetter).toHaveBeenCalledWith("/uk");
    expect(document.cookie).toContain("budget-locale=uk");
  });

  describe("OAuth return hop (MCP connect)", () => {
    async function submitWithSearch(search: string) {
      cleanup();
      Object.defineProperty(window.location, "search", {
        configurable: true,
        get: () => search,
      });
      render(<SignInForm locale="en" />);
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "Password1!" },
      });
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
      await waitFor(() => expect(hrefSetter).toHaveBeenCalled());
      return hrefSetter.mock.calls[0]![0] as string;
    }

    it("returns to the authorize endpoint with the original query, minus the signature", async () => {
      const url = await submitWithSearch(
        "?response_type=code&client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&scope=read&state=s&exp=1&ba_iat=2&sig=xyz",
      );
      expect(url.startsWith("/auth/oauth2/authorize?")).toBe(true);
      const q = new URLSearchParams(url.split("?")[1]);
      expect(q.get("client_id")).toBe("abc");
      expect(q.get("redirect_uri")).toBe("https://claude.ai/cb");
      expect(q.get("scope")).toBe("read");
      expect(q.has("sig") || q.has("exp") || q.has("ba_iat")).toBe(false);
    });

    it("ignores crafted redirect parameters", async () => {
      expect(await submitWithSearch("?next=https://evil.example")).toBe("/en");
      hrefSetter.mockClear();
      expect(await submitWithSearch("?redirect=//evil")).toBe("/en");
    });

    it("keeps the locale home without OAuth params", async () => {
      expect(await submitWithSearch("")).toBe("/en");
    });
  });
});
