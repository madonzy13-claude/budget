/**
 * push-prefs-section.test.tsx — a per-kind push toggle (r36 dropped
 * TASK_COMPLETED; INCOME_UNDER_PLANNED is the current spendings kind) and the
 * budget-update reminder (toggle + weekday picker that PATCHes {days, tz}).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const patchMock = vi.fn(async () => ({ ok: true }));
const getMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  api: {
    push: {
      preferences: {
        $get: (...a: unknown[]) => getMock(...a),
        $patch: (...a: unknown[]) => patchMock(...a),
      },
      "subscription-status": {
        $get: async () => ({
          ok: true,
          json: async () => ({ subscribed: true }),
        }),
      },
    },
  },
}));

// happy-dom lacks a service worker → give the status query a live subscription
// so masterOn stays true (else the toggles unmount once the status query resolves).
Object.defineProperty(navigator, "serviceWorker", {
  configurable: true,
  value: {
    ready: Promise.resolve({
      pushManager: {
        getSubscription: async () => ({ endpoint: "https://p/x" }),
      },
    }),
  },
});
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "Europe/Warsaw",
}));
vi.mock("@/lib/push-subscribe", () => ({
  subscribeToPushForBudget: vi.fn(async () => "subscribed"),
}));

import { PushPrefsSection } from "@/components/settings/push-prefs-section";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const budgetId = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  patchMock.mockClear();
  getMock.mockReset();
  getMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      preferences: [
        { notificationType: "RESERVE_TOPUP", enabled: true, config: null },
        {
          notificationType: "INCOME_UNDER_PLANNED",
          enabled: true,
          config: null,
        },
        {
          notificationType: "BUDGET_REMINDER",
          enabled: true,
          config: { days: [1, 2, 3, 4, 5], tz: "Europe/Warsaw" },
        },
      ],
    }),
  });
});

describe("PushPrefsSection r32 toggles", () => {
  it("renders a per-kind toggle and the reminder + 7 day buttons", async () => {
    wrap(<PushPrefsSection budgetId={budgetId} initialMasterOn />);
    expect(screen.getByTestId("push-kind-INCOME_UNDER_PLANNED")).toBeTruthy();
    expect(screen.getByTestId("push-reminder-switch")).toBeTruthy();
    for (let d = 1; d <= 7; d++) {
      expect(screen.getByTestId(`push-reminder-day-${d}`)).toBeTruthy();
    }
    // After prefs load: seed selects Mon–Fri, so Sat(6)/Sun(7) are off.
    await waitFor(() =>
      expect(
        screen.getByTestId("push-reminder-day-6").getAttribute("aria-pressed"),
      ).toBe("false"),
    );
    expect(
      screen.getByTestId("push-reminder-day-1").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("toggling a day PATCHes BUDGET_REMINDER with the new days + tz", async () => {
    wrap(<PushPrefsSection budgetId={budgetId} initialMasterOn />);
    await waitFor(() =>
      expect(
        screen.getByTestId("push-reminder-day-6").getAttribute("aria-pressed"),
      ).toBe("false"),
    );
    fireEvent.click(screen.getByTestId("push-reminder-day-6")); // add Saturday

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const arg = patchMock.mock.calls.at(-1)![0] as {
      json: {
        notificationType: string;
        enabled: boolean;
        config: { days: number[] };
      };
    };
    expect(arg.json.notificationType).toBe("BUDGET_REMINDER");
    expect(arg.json.enabled).toBe(true);
    expect(arg.json.config.days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("turning the reminder off PATCHes enabled=false but keeps the days", async () => {
    wrap(<PushPrefsSection budgetId={budgetId} initialMasterOn />);
    await waitFor(() =>
      expect(
        screen.getByTestId("push-reminder-day-6").getAttribute("aria-pressed"),
      ).toBe("false"),
    );
    fireEvent.click(screen.getByTestId("push-reminder-switch"));
    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const arg = patchMock.mock.calls.at(-1)![0] as {
      json: { enabled: boolean; config: { days: number[] } };
    };
    expect(arg.json.enabled).toBe(false);
    expect(arg.json.config.days).toEqual([1, 2, 3, 4, 5]);
  });
});
