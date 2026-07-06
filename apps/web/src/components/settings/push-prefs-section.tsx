"use client";

/**
 * push-prefs-section.tsx — Settings Notifications accordion section (Task 3, Phase 08-05)
 *
 * Master Switch: Notification.requestPermission → PushManager.subscribe → POST /push/subscribe
 * Per-kind rows: PATCH /push/preferences with optimistic + rollback + toast.
 *
 * CACHING (260618): both the per-budget master (subscription-status) and the
 * per-kind preferences are React Query queries — keyed, PERSISTED (query-persist
 * shouldPersist) and PREFETCHED (use-prefetch-budget-tabs) exactly like
 * budget-members. So re-opening Settings (re-nav / reload / offline) hydrates the
 * notification toggles instantly from cache instead of flashing defaults, then
 * SWR-revalidates. Toggles update the query cache optimistically (setQueryData)
 * so the persisted snapshot reflects the new value immediately.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { subscribeToPushForBudget } from "@/lib/push-subscribe";

const NOTIFICATION_KINDS = [
  "RESERVE_TOPUP",
  "CONFIRM_DRAFT",
  "CUSHION_BELOW_TARGET",
  // r33: income < total planned spending — "review your spendings".
  "INCOME_UNDER_PLANNED",
  // r32: completion nudge (fires only for OTHER members' completions).
  "TASK_COMPLETED",
] as const;

type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// r32: ISO weekday order for the reminder day-picker (1=Mon..7=Sun).
const REMINDER_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

interface PrefRow {
  notificationType: string;
  enabled: boolean;
  config?: { days?: number[]; tz?: string } | null;
}

interface PushPreferencesData {
  preferences: PrefRow[];
}

/** Cache keys — shared (by shape) with use-prefetch-budget-tabs + query-persist. */
export const pushPrefsKey = (budgetId: string) =>
  ["push-prefs", budgetId] as const;
export const pushStatusKey = (budgetId: string) =>
  ["push-subscription-status", budgetId] as const;

interface PushPrefsSectionProps {
  budgetId: string;
  /** For testing: start with master already ON (skips permission flow) */
  initialMasterOn?: boolean;
}

export function PushPrefsSection({
  budgetId,
  initialMasterOn = false,
}: PushPrefsSectionProps) {
  const t = useTranslations("settings.push");
  const qc = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  // MASTER — per-budget subscription status (device endpoint + this budget).
  // Persisted + prefetched, so it hydrates from cache on re-nav/offline.
  const statusQuery = useQuery({
    queryKey: pushStatusKey(budgetId),
    queryFn: async (): Promise<{ subscribed: boolean }> => {
      try {
        const reg = await navigator.serviceWorker?.ready;
        const sub = await reg?.pushManager?.getSubscription?.();
        if (!sub) return { subscribed: false };
        const res = await api.push["subscription-status"].$get({
          query: { budgetId, endpoint: sub.endpoint },
        });
        if (!res.ok) return { subscribed: false };
        return (await res.json()) as { subscribed: boolean };
      } catch {
        return { subscribed: false };
      }
    },
  });

  // PER-KIND toggles — GET /push/preferences?budgetId. Persisted + prefetched.
  const prefsQuery = useQuery({
    queryKey: pushPrefsKey(budgetId),
    queryFn: async (): Promise<PushPreferencesData> => {
      const res = await api.push.preferences.$get({ query: { budgetId } });
      if (!res.ok) throw new Error("Failed to load push preferences");
      return (await res.json()) as PushPreferencesData;
    },
  });

  const masterOn = statusQuery.data?.subscribed ?? initialMasterOn;

  const kindEnabled = useMemo<Record<NotificationKind, boolean>>(() => {
    const base: Record<NotificationKind, boolean> = {
      RESERVE_TOPUP: true,
      CONFIRM_DRAFT: true,
      CUSHION_BELOW_TARGET: true,
      INCOME_UNDER_PLANNED: true,
      TASK_COMPLETED: true,
    };
    for (const pref of prefsQuery.data?.preferences ?? []) {
      if (
        (NOTIFICATION_KINDS as readonly string[]).includes(
          pref.notificationType,
        )
      ) {
        base[pref.notificationType as NotificationKind] = pref.enabled;
      }
    }
    return base;
  }, [prefsQuery.data]);

  function setMasterCache(subscribed: boolean) {
    qc.setQueryData(pushStatusKey(budgetId), { subscribed });
  }

  function setKindCache(kind: NotificationKind, enabled: boolean) {
    qc.setQueryData<PushPreferencesData>(pushPrefsKey(budgetId), (old) => {
      const prefs = (old?.preferences ?? []).slice();
      const idx = prefs.findIndex((p) => p.notificationType === kind);
      if (idx >= 0) prefs[idx] = { ...prefs[idx]!, enabled };
      else prefs.push({ notificationType: kind, enabled });
      return { preferences: prefs };
    });
  }

  // r32: budget-update reminder — enabled + selected weekdays (default all 7).
  const reminder = useMemo(() => {
    const p = prefsQuery.data?.preferences.find(
      (x) => x.notificationType === "BUDGET_REMINDER",
    );
    return {
      enabled: p ? p.enabled : true,
      days: p?.config?.days ?? [1, 2, 3, 4, 5, 6, 7],
    };
  }, [prefsQuery.data]);

  function setReminderCache(enabled: boolean, days: number[]) {
    qc.setQueryData<PushPreferencesData>(pushPrefsKey(budgetId), (old) => {
      const prefs = (old?.preferences ?? []).slice();
      const idx = prefs.findIndex(
        (p) => p.notificationType === "BUDGET_REMINDER",
      );
      const row: PrefRow = {
        notificationType: "BUDGET_REMINDER",
        enabled,
        // Only the weekdays are stored; the reminder always fires at 18:00 in the
        // member's live identity timezone (geo-seeded at sign-up), so we don't
        // snapshot a tz here — that would go stale if the user moves.
        config: { days },
      };
      if (idx >= 0) prefs[idx] = row;
      else prefs.push(row);
      return { preferences: prefs };
    });
  }

  async function patchReminder(enabled: boolean, days: number[]) {
    const prevEnabled = reminder.enabled;
    const prevDays = reminder.days;
    setReminderCache(enabled, days);
    try {
      const res = await api.push.preferences.$patch({
        json: {
          budgetId,
          notificationType: "BUDGET_REMINDER",
          enabled,
          config: { days },
        },
      });
      if (!res.ok) throw new Error("Patch failed");
      toast.success(t("saved"));
    } catch {
      setReminderCache(prevEnabled, prevDays);
      toast.error(t("subscribeError"));
    }
  }

  function handleReminderToggle(checked: boolean) {
    void patchReminder(checked, reminder.days);
  }

  function handleDayToggle(day: number) {
    const next = reminder.days.includes(day)
      ? reminder.days.filter((d) => d !== day)
      : [...reminder.days, day].sort((a, b) => a - b);
    void patchReminder(reminder.enabled, next);
  }

  async function handleMasterToggle(checked: boolean) {
    if (!checked) {
      // Turning off for THIS budget: delete only the per-budget subscription
      // row (server). We do NOT call pushManager.unsubscribe() — the device
      // endpoint must stay live for any OTHER budgets the user enabled.
      setIsLoading(true);
      try {
        const reg = await navigator.serviceWorker?.ready;
        const sub = await reg?.pushManager?.getSubscription?.();
        if (sub) {
          await api.push.subscribe.$delete({
            json: { endpoint: sub.endpoint, budgetId },
          });
        }
      } catch {
        // best-effort; still reflect OFF locally
      } finally {
        setIsLoading(false);
      }
      setMasterCache(false);
      return;
    }

    // Request permission + subscribe THIS device for THIS budget (shared helper,
    // also used by onboarding so the two stay in lockstep).
    setIsLoading(true);
    try {
      const result = await subscribeToPushForBudget(budgetId);
      if (result === "subscribed") {
        setMasterCache(true);
        toast.success(t("saved"));
      } else {
        setMasterCache(false);
        // Distinct causes: an explicit permission block vs. push not available on
        // this device (no VAPID key / not installed) vs. a transient failure. The
        // old code showed "permission denied" for all three, which hid a missing
        // NEXT_PUBLIC_VAPID_PUBLIC_KEY as a fake permission problem (r31e).
        toast.error(
          result === "denied"
            ? t("permissionDenied")
            : result === "unsupported"
              ? t("unsupported")
              : t("subscribeError"),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleKindToggle(kind: NotificationKind, checked: boolean) {
    const previous = kindEnabled[kind];
    // Optimistic — update the cached prefs so the persisted snapshot is current.
    setKindCache(kind, checked);

    try {
      const res = await api.push.preferences.$patch({
        json: {
          budgetId,
          notificationType: kind,
          enabled: checked,
        },
      });
      if (!res.ok) throw new Error("Patch failed");
      toast.success(t("saved"));
    } catch {
      // Rollback
      setKindCache(kind, previous);
      toast.error("Failed to save notification preference. Try again.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-[var(--body-on-dark)]">
            {t("enableLabel")}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("enableDescription")}
          </p>
        </div>
        <Switch
          data-testid="push-master-switch"
          checked={masterOn}
          disabled={isLoading}
          onCheckedChange={handleMasterToggle}
          aria-label={t("enableLabel")}
        />
      </div>

      {/* Per-kind toggles — only visible when master ON */}
      {masterOn && (
        <div className="space-y-3 border-t border-[var(--hairline-on-dark)] pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {t("kindsLabel")}
          </p>
          {NOTIFICATION_KINDS.map((kind) => (
            <div key={kind} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm text-[var(--body-on-dark)]">
                  {t(`kind.${kind}.label`)}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t(`kind.${kind}.description`)}
                </p>
              </div>
              <Switch
                data-testid={`push-kind-${kind}`}
                checked={kindEnabled[kind]}
                onCheckedChange={(checked) => handleKindToggle(kind, checked)}
                aria-label={t(`kind.${kind}.label`)}
              />
            </div>
          ))}

          {/* r32: budget-update reminder — toggle + weekday picker. */}
          <div className="space-y-3 border-t border-[var(--hairline-on-dark)] pt-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm text-[var(--body-on-dark)]">
                  {t("reminder.label")}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t("reminder.description")}
                </p>
              </div>
              <Switch
                data-testid="push-reminder-switch"
                checked={reminder.enabled}
                onCheckedChange={handleReminderToggle}
                aria-label={t("reminder.label")}
              />
            </div>
            {reminder.enabled && (
              <div
                className="flex flex-wrap gap-1.5"
                data-testid="push-reminder-days"
              >
                {REMINDER_DAYS.map((day) => {
                  const on = reminder.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      data-testid={`push-reminder-day-${day}`}
                      aria-pressed={on}
                      aria-label={t(`reminder.day.${day}`)}
                      onClick={() => handleDayToggle(day)}
                      className={
                        "h-9 min-w-9 rounded-[var(--radius-md)] px-2 text-xs font-medium transition-colors " +
                        (on
                          ? "bg-[var(--primary)] text-[var(--on-primary)]"
                          : "bg-[var(--surface-elevated-dark)] text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]")
                      }
                    >
                      {t(`reminder.dayShort.${day}`)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
