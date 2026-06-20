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
import {
  setDeferredPrompt,
  setInstalled,
  isInstalled,
} from "@/lib/pwa-install-store";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// iOS detection — controllable per test
const iosMock = { value: false };
vi.mock("@/lib/ios-install", () => ({
  isIos: () => iosMock.value,
}));

// Installed-heuristic — controllable per test
const assumeInstalledMock = { value: false };
vi.mock("@/lib/install-detect", () => ({
  shouldAssumeInstalled: () => assumeInstalledMock.value,
}));

// Mock sonner (Dialog uses it in some flows)
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock UI dialog components
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
  iosMock.value = false;
  assumeInstalledMock.value = false;
  // Clear store
  setDeferredPrompt(null);
  setInstalled(false);
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

describe("InstallBanner — iOS (no beforeinstallprompt support)", () => {
  test("renders on iOS even without a captured prompt", async () => {
    iosMock.value = true;

    render(<InstallBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    });
  });

  test("install CTA on iOS opens Add-to-Home-Screen instructions dialog", async () => {
    iosMock.value = true;

    render(<InstallBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("install-banner-cta"));
    });

    expect(screen.getByTestId("ios-install-dialog")).toBeInTheDocument();
    expect(mockPrompt).not.toHaveBeenCalled();
  });

  test("does not render on iOS when previously dismissed", async () => {
    iosMock.value = true;
    localStorage.setItem("pwa-install-dismissed", "1");

    render(<InstallBanner />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });
});

describe("InstallBanner — installed state", () => {
  test("appinstalled event records installed and hides the banner", async () => {
    const prompt = makeDeferredPrompt();
    setDeferredPrompt(prompt);

    render(<InstallBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("install-banner-cta")).toBeInTheDocument();
    });

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(isInstalled()).toBe(true);
    await waitFor(() => {
      expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
    });
  });

  test("does not render when already installed (even on iOS)", async () => {
    setInstalled(true);
    iosMock.value = true;

    render(<InstallBanner />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });

  test("banner is mobile-only (hidden above the sm breakpoint)", async () => {
    const prompt = makeDeferredPrompt();
    setDeferredPrompt(prompt);

    render(<InstallBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    });
    expect(screen.getByTestId("install-banner").className).toContain(
      "sm:hidden",
    );
  });
});

describe("InstallBanner — installed heuristic (pre-existing installs)", () => {
  test("no prompt + heuristic positive → banner suppressed after probe window", async () => {
    vi.useFakeTimers();
    assumeInstalledMock.value = true;
    iosMock.value = true; // banner would otherwise render on iOS

    render(<InstallBanner />);

    // flush mount effects (fake timers: no waitFor here)
    await act(async () => {});
    expect(screen.getByTestId("install-banner")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
    });
  });

  test("late beforeinstallprompt reverses the heuristic back to install mode", async () => {
    vi.useFakeTimers();
    assumeInstalledMock.value = true;

    render(<InstallBanner />);

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    vi.useRealTimers();

    await act(async () => {
      setDeferredPrompt(makeDeferredPrompt());
    });

    await waitFor(() => {
      expect(screen.getByTestId("install-banner-cta")).toBeInTheDocument();
    });
  });
});
