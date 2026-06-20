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
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { PushPrefsSection } from "@/components/settings/push-prefs-section";

// The section now uses React Query (persisted + prefetched like members), so
// every render needs a provider. Fresh client per render → no cross-test leak.
function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

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
const mockSubscribeDelete = vi.fn();
const mockSubscriptionStatusGet = vi.fn();
const mockPreferencesGet = vi.fn();
const mockPreferencesPatch = vi.fn();

vi.mock("@/lib/api-client", () => ({
  api: {
    push: {
      subscribe: {
        $post: (...args: unknown[]) => mockSubscribePost(...args),
        $delete: (...args: unknown[]) => mockSubscribeDelete(...args),
      },
      "subscription-status": {
        $get: (...args: unknown[]) => mockSubscriptionStatusGet(...args),
      },
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
  mockSubscribeDelete.mockResolvedValue({ ok: true });
  mockPreferencesPatch.mockResolvedValue({ ok: true });
  // Per-budget master defaults to NOT subscribed for this budget.
  mockSubscriptionStatusGet.mockResolvedValue({
    ok: true,
    json: async () => ({ subscribed: false }),
  });

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
    renderWithClient(<PushPrefsSection budgetId="budget-1" />);
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

    renderWithClient(<PushPrefsSection budgetId="budget-1" />);

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

    renderWithClient(<PushPrefsSection budgetId="budget-1" />);

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
    renderWithClient(<PushPrefsSection budgetId="budget-1" />);

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

  /** Override navigator.serviceWorker so pushManager.getSubscription resolves to
   *  `sub` (a truthy subscription or null) for the master-state-on-load tests. */
  function setSubscription(sub: unknown) {
    Object.defineProperty(global, "navigator", {
      writable: true,
      configurable: true,
      value: {
        serviceWorker: {
          ready: Promise.resolve({
            pushManager: {
              subscribe: mockSubscribe,
              getSubscription: vi.fn().mockResolvedValue(sub),
            },
          }),
        },
      },
    });
  }

  test("on load: master reflects the PER-BUDGET subscription status; kinds reflect saved prefs (260618)", async () => {
    setSubscription({ endpoint: "https://push.example.com/sub" }); // device has an endpoint
    // …and the server says THIS budget is subscribed.
    mockSubscriptionStatusGet.mockResolvedValue({
      ok: true,
      json: async () => ({ subscribed: true }),
    });
    mockPreferencesGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        preferences: [
          { notificationType: "RESERVE_TOPUP", enabled: false },
          { notificationType: "CONFIRM_DRAFT", enabled: true },
          { notificationType: "CUSHION_BELOW_TARGET", enabled: true },
        ],
      }),
    });

    renderWithClient(<PushPrefsSection budgetId="budget-9" />);

    // The route 400s without ?budgetId — the component MUST pass it.
    await waitFor(() => {
      expect(mockPreferencesGet).toHaveBeenCalledWith({
        query: { budgetId: "budget-9" },
      });
    });
    // Master is derived from the PER-BUDGET status endpoint (budgetId + endpoint).
    await waitFor(() => {
      expect(mockSubscriptionStatusGet).toHaveBeenCalledWith({
        query: {
          budgetId: "budget-9",
          endpoint: "https://push.example.com/sub",
        },
      });
    });
    // Subscribed for this budget → master ON → per-kind switches visible.
    await waitFor(() => {
      expect(screen.getByTestId("push-kind-RESERVE_TOPUP")).toBeInTheDocument();
    });
    // RESERVE_TOPUP loaded disabled (saved state honored).
    expect(screen.getByTestId("push-kind-RESERVE_TOPUP")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
  });

  test("device subscribed but NOT for THIS budget → master OFF (per-budget isolation, Bug B)", async () => {
    setSubscription({ endpoint: "https://push.example.com/sub" }); // device endpoint exists
    // …but this budget was never enabled → server returns subscribed:false.
    mockSubscriptionStatusGet.mockResolvedValue({
      ok: true,
      json: async () => ({ subscribed: false }),
    });

    renderWithClient(<PushPrefsSection budgetId="budget-2" />);

    await waitFor(() => {
      expect(mockSubscriptionStatusGet).toHaveBeenCalled();
    });
    // Not subscribed for budget-2 → master OFF even though the device has a
    // (different-budget) subscription → per-kind hidden.
    expect(screen.getByTestId("push-master-switch")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(
      screen.queryByTestId("push-kind-RESERVE_TOPUP"),
    ).not.toBeInTheDocument();
  });

  test("no device subscription → master OFF, no status call", async () => {
    setSubscription(null); // never subscribed on this device

    renderWithClient(<PushPrefsSection budgetId="budget-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("push-master-switch")).toBeInTheDocument();
    });
    expect(screen.getByTestId("push-master-switch")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    // No endpoint → never queries per-budget status.
    expect(mockSubscriptionStatusGet).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("push-kind-RESERVE_TOPUP"),
    ).not.toBeInTheDocument();
  });

  test("turning master OFF deletes only THIS budget's subscription row", async () => {
    setSubscription({ endpoint: "https://push.example.com/sub" });
    // Server confirms this budget is subscribed so master is ON after mount.
    mockSubscriptionStatusGet.mockResolvedValue({
      ok: true,
      json: async () => ({ subscribed: true }),
    });

    renderWithClient(<PushPrefsSection budgetId="budget-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("push-kind-RESERVE_TOPUP")).toBeInTheDocument();
    });

    const masterSwitch = screen.getByTestId("push-master-switch");
    await waitFor(() =>
      expect(masterSwitch).toHaveAttribute("data-state", "checked"),
    );
    await act(async () => {
      fireEvent.click(masterSwitch); // ON → OFF
    });

    await waitFor(() => {
      expect(mockSubscribeDelete).toHaveBeenCalledWith({
        json: {
          endpoint: "https://push.example.com/sub",
          budgetId: "budget-1",
        },
      });
    });
    // Does NOT call pushManager.unsubscribe (device endpoint stays for other budgets).
    expect(masterSwitch).toHaveAttribute("data-state", "unchecked");
  });

  test("per-kind PATCH called when toggle changes (master ON)", async () => {
    // Master ON via a confirmed per-budget subscription.
    setSubscription({ endpoint: "https://push.example.com/sub" });
    mockSubscriptionStatusGet.mockResolvedValue({
      ok: true,
      json: async () => ({ subscribed: true }),
    });

    renderWithClient(<PushPrefsSection budgetId="budget-1" />);

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
