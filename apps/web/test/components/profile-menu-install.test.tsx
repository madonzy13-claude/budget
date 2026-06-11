/**
 * profile-menu-install.test.tsx
 * UAT-08 gap: "Install app" entry must hide when the PWA is installed and
 * must open the iOS Add-to-Home-Screen instructions instead of the dead-end
 * "not available" toast on iOS.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfileMenu } from "@/components/auth/profile-menu";
import { setDeferredPrompt, setInstalled } from "@/lib/pwa-install-store";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
}));

const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/common/nav-link", () => ({
  NavLink: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...props}>{children}</a>
  ),
}));

const iosMock = { value: false };
vi.mock("@/lib/ios-install", () => ({
  isIos: () => iosMock.value,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogClose: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const user = { name: "UAT Probe", email: "uat@example.com" };

async function openMenu() {
  render(<ProfileMenu locale="en" user={user} />);
  fireEvent.click(screen.getByTestId("profile-menu-trigger"));
  await waitFor(() => {
    expect(screen.getByTestId("profile-menu-sign-out")).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  iosMock.value = false;
  localStorage.clear();
  setDeferredPrompt(null);
  setInstalled(false);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

describe("ProfileMenu install entry", () => {
  test("hidden when the PWA is already installed", async () => {
    setInstalled(true);
    await openMenu();

    expect(
      screen.queryByTestId("profile-menu-install"),
    ).not.toBeInTheDocument();
  });

  test("uses the captured prompt when available", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    setDeferredPrompt({
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    await openMenu();

    fireEvent.click(screen.getByTestId("profile-menu-install"));

    await waitFor(() => expect(prompt).toHaveBeenCalled());
    expect(toastInfo).not.toHaveBeenCalled();
  });

  test("opens iOS instructions dialog on iOS instead of toast", async () => {
    iosMock.value = true;
    await openMenu();

    fireEvent.click(screen.getByTestId("profile-menu-install"));

    await waitFor(() => {
      expect(screen.getByTestId("ios-install-dialog")).toBeInTheDocument();
    });
    expect(toastInfo).not.toHaveBeenCalled();
  });

  test("falls back to notAvailable toast on unsupported non-iOS browsers", async () => {
    await openMenu();

    fireEvent.click(screen.getByTestId("profile-menu-install"));

    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
  });
});
