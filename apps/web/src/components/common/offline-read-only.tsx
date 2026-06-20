"use client";
/**
 * OfflineReadOnly — global read-only enforcement while the device is offline.
 *
 * Robust-minimal offline ([[project_offline_architecture]]) made reads reliable
 * and writes honestly-refused per-mutation. Per user decision (2026-06-17) the
 * UX is stronger: while `navigator.onLine===false` the whole app is READ-ONLY —
 * every write control (fields, toggles, selects, submit/delete buttons) is
 * blocked the instant it's touched and a bottom toast explains, instead of
 * letting an optimistic edit fire → invalidate → re-fetch → skeleton offline.
 * Navigation and viewing stay live (tab pills are links; month-nav / switcher /
 * profile / open-sheet are plain buttons; see shouldBlockOfflineInteraction).
 *
 * The per-mutation `clientApiWrite` guard stays as the backstop for the
 * "lying-true" case (onLine reports true on a dead link) where the UI can't know
 * it should be read-only.
 *
 * Implementation: capture-phase listeners on `document` so we win before the
 * control's own handler. pointerdown/click block activation + focus; beforeinput
 * blocks typing/paste into a focused field; change blocks select/checkbox commit;
 * submit blocks a whole form save. The toast is throttled (one per ~1.5s) so a
 * frantic tap doesn't stack toasts. The visual dimming is driven by the
 * `html.is-offline` class the root-layout inline marker maintains pre-paint.
 */
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { shouldBlockOfflineInteraction } from "@/lib/offline-readonly";
import { useConnectivity } from "@/components/common/connectivity-provider";

export function OfflineReadOnly() {
  const t = useTranslations();
  const { degraded, reason } = useConnectivity();
  // The capture handler is bound once; read the latest connectivity via a ref so
  // it sees the current status without re-subscribing on every change.
  const stateRef = useRef({ degraded, reason });
  stateRef.current = { degraded, reason };

  useEffect(() => {
    // -Infinity (not 0) so the FIRST blocked interaction always toasts, even
    // within the first 1.5s after mount (performance.now() can be small).
    let lastToast = Number.NEGATIVE_INFINITY;

    function block(e: Event) {
      // Block writes whenever the app is degraded — offline OR server-down.
      if (!stateRef.current.degraded) return;
      const target = e.target as Element | null;
      if (!shouldBlockOfflineInteraction(target)) return;
      // Stop the control from acting (focus / activate / type / submit).
      e.preventDefault();
      e.stopPropagation();
      // sonner: bottom-center, throttled so one tap = one toast.
      const now = performance.now();
      if (now - lastToast > 1500) {
        lastToast = now;
        const msg =
          stateRef.current.reason === "server-down"
            ? t("serverDown.banner.readOnly")
            : t("offline.readOnly");
        toast(msg, { position: "bottom-center" });
      }
    }

    const capture = true;
    const types: (keyof DocumentEventMap)[] = [
      "pointerdown",
      "mousedown",
      "click",
      "beforeinput",
      "change",
      "submit",
    ];
    for (const ty of types) document.addEventListener(ty, block, capture);
    return () => {
      for (const ty of types) document.removeEventListener(ty, block, capture);
    };
  }, [t]);

  return null;
}
