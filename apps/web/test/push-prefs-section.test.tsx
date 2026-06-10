/**
 * push-prefs-section.test.tsx
 * Tests for PushPrefsSection component (Task 3, Phase 08-05)
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { toast } from "sonner";
import { PushPrefsSection } from "@/components/settings/push-prefs-section";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock api-client
const mockSubscribePost = vi.fn();
const mockPreferencesGet = vi.fn();
const mockPreferencesPatch = vi.fn();

vi.mock("@/lib/api-client", () => ({
  api: {
    push: {
      subscribe: { $post: (...args: unknown[]) => mockSubscribePost(...args) },
      preferences: {
        $get: (...args: unknown[]) => mockPreferencesGet(...args),
        $patch: (...args: unknown[]) => mockPreferencesPatch(...args),
      },
    },
  },
}));

// Mock Notification and PushManager APIs
const mockRequestPermission = vi.fn();
const mockSubscribe = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Default: preferences load empty
  mockPreferencesGet.mockResolvedValue({
    ok: true,
    json: async () => ({ preferences: [] }),
  });

  // Default subscription response
  mockSubscribePost.mockResolvedValue({ ok: true });
  mockPreferencesPatch.mockResolvedValue({ ok: true });

  // Setup browser APIs
  Object.defineProperty(global, "Notification", {
    writable: true,
    value: {
      permission: "default",
      requestPermission: mockRequestPermission,
    },
  });

  const mockSubscribeInstance = mockSubscribe;
  Object.defineProperty(global, "navigator", {
    writable: true,
    value: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            subscribe: mockSubscribeInstance,
            getSubscription: vi.fn().mockResolvedValue(null),
          },
        }),
      },
    },
  });

  process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] = "test-vapid-key";
});

describe("PushPrefsSection", () => {
  test("renders master switch with correct testid", async () => {
    render(<PushPrefsSection budgetId="budget-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("push-master-switch")).toBeInTheDocument();
    });
  });

  test("granted permission → subscribes and posts to API", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    mockSubscribe.mockResolvedValue({
      endpoint: "https://push.example.com/sub",
      getKey: (k: string) =>
        k === "p256dh" ? new Uint8Array([1, 2]) : new Uint8Array([3, 4]),
    });

    render(<PushPrefsSection budgetId="budget-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("push-master-switch")).toBeInTheDocument();
    });

    const masterSwitch = screen.getByTestId("push-master-switch");
    await act(async () => {
      fireEvent.click(masterSwitch);
    });

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockSubscribePost).toHaveBeenCalled();
    });
  });

  test("denied permission → snaps back to OFF + shows error toast", async () => {
    mockRequestPermission.mockResolvedValue("denied");

    render(<PushPrefsSection budgetId="budget-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("push-master-switch")).toBeInTheDocument();
    });

    const masterSwitch = screen.getByTestId("push-master-switch");
    await act(async () => {
      fireEvent.click(masterSwitch);
    });

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });

    // Master switch should be OFF (not checked)
    expect(masterSwitch).toHaveAttribute("data-state", "unchecked");
  });

  test("per-kind switches hidden when master OFF", async () => {
    render(<PushPrefsSection budgetId="budget-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("push-master-switch")).toBeInTheDocument();
    });

    // Master is OFF by default — per-kind switches should not be visible
    expect(
      screen.queryByTestId("push-kind-RESERVE_TOPUP"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("push-kind-CONFIRM_DRAFT"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("push-kind-CUSHION_BELOW_TARGET"),
    ).not.toBeInTheDocument();
  });

  test("per-kind PATCH called when toggle changes (master ON)", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    mockSubscribe.mockResolvedValue({
      endpoint: "https://push.example.com/sub",
      getKey: (k: string) =>
        k === "p256dh" ? new Uint8Array([1, 2]) : new Uint8Array([3, 4]),
    });

    // Start with master already ON by pre-enabling
    render(<PushPrefsSection budgetId="budget-1" initialMasterOn={true} />);

    await waitFor(() => {
      expect(screen.getByTestId("push-kind-RESERVE_TOPUP")).toBeInTheDocument();
    });

    const reserveSwitch = screen.getByTestId("push-kind-RESERVE_TOPUP");
    await act(async () => {
      fireEvent.click(reserveSwitch);
    });

    await waitFor(() => {
      expect(mockPreferencesPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            budgetId: "budget-1",
            notificationType: "RESERVE_TOPUP",
          }),
        }),
      );
    });
  });
});
