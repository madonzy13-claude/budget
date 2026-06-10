/**
 * install-banner.test.tsx
 * Tests for InstallBanner component (Task 4, Phase 08-05)
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { InstallBanner } from "@/components/common/install-banner";
import { setDeferredPrompt } from "@/lib/pwa-install-store";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner (Dialog uses it in some flows)
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock UI dialog components
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogClose: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-asChild={asChild}>{children}</div>,
}));

const mockPrompt = vi.fn();
const mockUserChoice = Promise.resolve({ outcome: "accepted" as const });

function makeDeferredPrompt() {
  return {
    prompt: mockPrompt,
    userChoice: mockUserChoice,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear store
  setDeferredPrompt(null);
  // Clear localStorage
  localStorage.clear();
  // Default: NOT standalone
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false, // not standalone
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

afterEach(() => {
  // Reset store after each test
  setDeferredPrompt(null);
});

describe("InstallBanner", () => {
  test("renders when beforeinstallprompt captured", async () => {
    // Pre-inject prompt into store before component mounts
    const prompt = makeDeferredPrompt();
    setDeferredPrompt(prompt);

    render(<InstallBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    });
  });

  test("returns null when running in standalone mode", async () => {
    // Override matchMedia to return standalone=true
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("standalone"), // standalone=true
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    const prompt = makeDeferredPrompt();
    setDeferredPrompt(prompt);

    render(<InstallBanner />);

    // Wait a tick for effects to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });

  test("dismiss sets localStorage and hides banner", async () => {
    const prompt = makeDeferredPrompt();
    setDeferredPrompt(prompt);

    render(<InstallBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("install-banner-dismiss"));

    expect(localStorage.getItem("pwa-install-dismissed")).toBe("1");
    await waitFor(() => {
      expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
    });
  });

  test("install click calls prompt()", async () => {
    const prompt = makeDeferredPrompt();
    setDeferredPrompt(prompt);

    render(<InstallBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("install-banner-cta"));
    });

    expect(mockPrompt).toHaveBeenCalled();
  });

  test("does not render when previously dismissed", async () => {
    localStorage.setItem("pwa-install-dismissed", "1");

    const prompt = makeDeferredPrompt();
    setDeferredPrompt(prompt);

    render(<InstallBanner />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });
});
