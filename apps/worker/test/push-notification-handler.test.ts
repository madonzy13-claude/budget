/**
 * push-notification-handler.test.ts — push dispatch worker handler (PWAX-05)
 *
 * Tests the task.created event consumer that looks up subscriptions + prefs
 * and calls sendPushNotification() for RESERVE_TOPUP / CONFIRM_DRAFT /
 * CUSHION_BELOW_TARGET task kinds.
 *
 * D-15: notification body must contain NO financial digits/amounts.
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks — must come before the module under test is imported
// ---------------------------------------------------------------------------

// Mock the platform event bus + sendPushNotification (both from @budget/platform)
const subscribedHandlers: Map<string, (evt: unknown) => Promise<void>> =
  new Map();
const mockEventBus = {
  subscribe: mock(
    (eventType: string, handler: (evt: unknown) => Promise<void>) => {
      subscribedHandlers.set(eventType, handler);
    },
  ),
};
const mockSendPush = mock(
  async (_sub: unknown, _payload: string): Promise<void> => {},
);
mock.module("@budget/platform", () => ({
  eventBus: mockEventBus,
  sendPushNotification: mockSendPush,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(
  overrides: Partial<{
    id: string;
    tenantId: string;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    locale: string;
  }> = {},
) {
  return {
    id: "sub-1",
    tenantId: "tenant-1",
    userId: "user-1",
    endpoint: "https://push.example.com/endpoint",
    p256dh: "p256dh-key",
    auth: "auth-key",
    locale: "en",
    ...overrides,
  };
}

function makeEvent(kind: string, budgetId = "budget-1", taskId = "task-1") {
  return {
    tenantId: "tenant-1",
    aggregateType: "Task",
    aggregateId: taskId,
    eventType: "task.created",
    payload: { kind, budgetId, taskId },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("push-notification-handler (PWAX-05)", () => {
  let mockPushRepo: {
    getSubscriptionsForBudget: ReturnType<typeof mock>;
    deleteSubscription: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockSendPush.mockClear();
    mockEventBus.subscribe.mockClear();
    subscribedHandlers.clear();

    mockPushRepo = {
      getSubscriptionsForBudget: mock(async () => [makeSub()]),
      deleteSubscription: mock(async () => {}),
    };
  });

  test("registers a task.created subscriber on init", async () => {
    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      "task.created",
      expect.any(Function),
    );
  });

  test("RESERVE_TOPUP — sends push to /budgets/<id>/reserves?task=<id>", async () => {
    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });

    const handler = subscribedHandlers.get("task.created")!;
    await handler(makeEvent("RESERVE_TOPUP", "budget-42", "task-99"));

    expect(mockSendPush).toHaveBeenCalledTimes(1);
    const [, payloadStr] = mockSendPush.mock.calls[0] as [unknown, string];
    const payload = JSON.parse(payloadStr);
    expect(payload.url).toBe("/en/budgets/budget-42/reserves?task=task-99");
    expect(payload.title).toBeTruthy();
    expect(payload.body).toBeTruthy();
    // D-15: body must not contain financial amounts (no digits)
    expect(/\d/.test(payload.body)).toBe(false);
  });

  test("CONFIRM_DRAFT — sends push to /budgets/<id>/spendings?task=<id>", async () => {
    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });

    const handler = subscribedHandlers.get("task.created")!;
    await handler(makeEvent("CONFIRM_DRAFT", "budget-42", "task-99"));

    const [, payloadStr] = mockSendPush.mock.calls[0] as [unknown, string];
    const payload = JSON.parse(payloadStr);
    expect(payload.url).toBe("/en/budgets/budget-42/spendings?task=task-99");
    expect(/\d/.test(payload.body)).toBe(false);
  });

  test("CUSHION_BELOW_TARGET — sends push to /budgets/<id>/wallets?task=<id>", async () => {
    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });

    const handler = subscribedHandlers.get("task.created")!;
    await handler(makeEvent("CUSHION_BELOW_TARGET", "budget-42", "task-99"));

    const [, payloadStr] = mockSendPush.mock.calls[0] as [unknown, string];
    const payload = JSON.parse(payloadStr);
    expect(payload.url).toBe("/en/budgets/budget-42/wallets?task=task-99");
    expect(/\d/.test(payload.body)).toBe(false);
  });

  test("unknown kind — no-op, no push sent, no throw", async () => {
    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });

    const handler = subscribedHandlers.get("task.created")!;
    await expect(
      handler(makeEvent("UNKNOWN_KIND_XYZ", "budget-42", "task-99")),
    ).resolves.toBeUndefined();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test("410 response — deletes stale subscription", async () => {
    const staleError = Object.assign(new Error("Gone"), { statusCode: 410 });
    mockSendPush.mockImplementationOnce(async () => {
      throw staleError;
    });

    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });

    const handler = subscribedHandlers.get("task.created")!;
    await handler(makeEvent("RESERVE_TOPUP", "budget-42", "task-99"));

    expect(mockPushRepo.deleteSubscription).toHaveBeenCalledWith(
      "https://push.example.com/endpoint",
      "tenant-1",
      "user-1",
    );
  });

  test("404 response — deletes stale subscription", async () => {
    const staleError = Object.assign(new Error("Not Found"), {
      statusCode: 404,
    });
    mockSendPush.mockImplementationOnce(async () => {
      throw staleError;
    });

    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });

    const handler = subscribedHandlers.get("task.created")!;
    await handler(makeEvent("RESERVE_TOPUP", "budget-42", "task-99"));

    expect(mockPushRepo.deleteSubscription).toHaveBeenCalledTimes(1);
  });

  test("no subscriptions — zero sends", async () => {
    mockPushRepo.getSubscriptionsForBudget.mockImplementationOnce(
      async () => [],
    );

    const { registerPushNotificationHandler } =
      await import("../src/handlers/push-notification-handler");
    registerPushNotificationHandler({ pushRepo: mockPushRepo as any });

    const handler = subscribedHandlers.get("task.created")!;
    await handler(makeEvent("RESERVE_TOPUP", "budget-42", "task-99"));

    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test("no SCAFFOLD sentinel remains in handler source", async () => {
    // Guard: ensure handler implementation has no SCAFFOLD marker
    const fs = require("fs");
    const handlerPath = new URL(
      "../src/handlers/push-notification-handler.ts",
      import.meta.url,
    ).pathname;
    let contents = "";
    try {
      contents = fs.readFileSync(handlerPath, "utf-8");
    } catch {
      // file doesn't exist yet — will fail on the import tests instead
      return;
    }
    expect(contents).not.toContain("SCAFFOLD");
  });
});
