/**
 * push-subscribe.test.ts — subscribeToPushForBudget shared helper.
 *
 * Per-budget subscribe used by Settings + onboarding (260618).
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { subscribeToPushForBudget } from "@/lib/push-subscribe";

const mockSubscribePost = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: {
    push: {
      subscribe: { $post: (...args: unknown[]) => mockSubscribePost(...args) },
    },
  },
}));

const mockRequestPermission = vi.fn();
const mockPushSubscribe = vi.fn();

function installBrowser(opts: { hasNotification?: boolean } = {}) {
  const hasNotification = opts.hasNotification ?? true;
  if (hasNotification) {
    Object.defineProperty(global, "Notification", {
      writable: true,
      configurable: true,
      value: {
        permission: "default",
        requestPermission: mockRequestPermission,
      },
    });
  } else {
    // @ts-expect-error remove for the unsupported case
    delete global.Notification;
  }
  Object.defineProperty(global, "navigator", {
    writable: true,
    configurable: true,
    value: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { subscribe: mockPushSubscribe },
        }),
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribePost.mockResolvedValue({ ok: true });
  mockPushSubscribe.mockResolvedValue({
    endpoint: "https://push.example.com/sub",
    getKey: (k: string) =>
      k === "p256dh" ? new Uint8Array([1, 2]) : new Uint8Array([3, 4]),
  });
  process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] = "test-vapid-key";
  installBrowser();
});

describe("subscribeToPushForBudget", () => {
  test("granted → posts subscribe with the budgetId and returns 'subscribed'", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    const result = await subscribeToPushForBudget("budget-1");
    expect(result).toBe("subscribed");
    // Must carry json AND an explicit X-Budget-ID header (else the API 403s when
    // the current path can't supply it — e.g. the onboarding wizard).
    expect(mockSubscribePost).toHaveBeenCalledWith(
      {
        json: expect.objectContaining({
          endpoint: "https://push.example.com/sub",
          budgetId: "budget-1",
        }),
      },
      { headers: { "X-Budget-ID": "budget-1" } },
    );
  });

  test("denied → 'denied', no POST", async () => {
    mockRequestPermission.mockResolvedValue("denied");
    const result = await subscribeToPushForBudget("budget-1");
    expect(result).toBe("denied");
    expect(mockSubscribePost).not.toHaveBeenCalled();
  });

  test("no Notification API → 'unsupported', no POST", async () => {
    installBrowser({ hasNotification: false });
    const result = await subscribeToPushForBudget("budget-1");
    expect(result).toBe("unsupported");
    expect(mockSubscribePost).not.toHaveBeenCalled();
  });

  test("server rejects → 'error'", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    mockSubscribePost.mockResolvedValue({ ok: false });
    const result = await subscribeToPushForBudget("budget-1");
    expect(result).toBe("error");
  });
});
