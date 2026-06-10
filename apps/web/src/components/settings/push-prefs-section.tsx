"use client";

/**
 * push-prefs-section.tsx — Settings Notifications accordion section (Task 3, Phase 08-05)
 *
 * Master Switch: Notification.requestPermission → PushManager.subscribe → POST /push/subscribe
 * Per-kind rows: PATCH /push/preferences with optimistic + rollback + toast (locale-select.tsx pattern)
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

const NOTIFICATION_KINDS = [
  "RESERVE_TOPUP",
  "CONFIRM_DRAFT",
  "CUSHION_BELOW_TARGET",
] as const;

type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

interface PushPrefsSectionProps {
  budgetId: string;
  /** For testing: start with master already ON (skips permission flow) */
  initialMasterOn?: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushPrefsSection({
  budgetId,
  initialMasterOn = false,
}: PushPrefsSectionProps) {
  const t = useTranslations("settings.push");

  const [masterOn, setMasterOn] = useState(initialMasterOn);
  const [isLoading, setIsLoading] = useState(false);
  // Per-kind enabled state: default all on when master is toggled on
  const [kindEnabled, setKindEnabled] = useState<
    Record<NotificationKind, boolean>
  >({
    RESERVE_TOPUP: true,
    CONFIRM_DRAFT: true,
    CUSHION_BELOW_TARGET: true,
  });

  // Load existing preferences on mount
  useEffect(() => {
    api.push.preferences
      .$get()
      .then(async (res: Response) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          preferences?: Array<{ notificationType: string; enabled: boolean }>;
        };
        if (data.preferences?.length) {
          const loaded: Partial<Record<NotificationKind, boolean>> = {};
          for (const pref of data.preferences) {
            if (
              NOTIFICATION_KINDS.includes(
                pref.notificationType as NotificationKind,
              )
            ) {
              loaded[pref.notificationType as NotificationKind] = pref.enabled;
            }
          }
          if (Object.keys(loaded).length > 0) {
            setKindEnabled((prev) => ({ ...prev, ...loaded }));
            // If any pref exists, master was previously enabled
            setMasterOn(true);
          }
        }
      })
      .catch(() => {
        // best-effort load
      });
  }, []);

  async function handleMasterToggle(checked: boolean) {
    if (!checked) {
      // Turning off — just update local state (no server call for unsubscribe here)
      setMasterOn(false);
      return;
    }

    // Request permission
    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMasterOn(false);
        toast.error(t("permissionDenied"));
        return;
      }

      // Subscribe via PushManager
      const registration = await navigator.serviceWorker.ready;
      const vapidKey = process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] ?? "";
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
          .buffer as ArrayBuffer,
      });

      // Extract keys
      const p256dhKey = subscription.getKey("p256dh");
      const authKey = subscription.getKey("auth");
      const p256dh = p256dhKey
        ? btoa(String.fromCharCode(...new Uint8Array(p256dhKey)))
        : "";
      const auth = authKey
        ? btoa(String.fromCharCode(...new Uint8Array(authKey)))
        : "";

      const res = await api.push.subscribe.$post({
        json: {
          endpoint: subscription.endpoint,
          p256dh,
          auth,
          budgetId,
        },
      });

      if (!res.ok) {
        throw new Error("Subscribe failed");
      }

      setMasterOn(true);
      toast.success(t("saved"));
    } catch {
      setMasterOn(false);
      toast.error(t("permissionDenied"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleKindToggle(kind: NotificationKind, checked: boolean) {
    const previous = kindEnabled[kind];
    // Optimistic update
    setKindEnabled((prev) => ({ ...prev, [kind]: checked }));

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
      setKindEnabled((prev) => ({ ...prev, [kind]: previous }));
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
        </div>
      )}
    </div>
  );
}
