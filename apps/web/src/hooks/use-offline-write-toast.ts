"use client";
/**
 * use-offline-write-toast.ts — the ONE honest-offline toast every mutation shows
 * when a write is refused because the device is offline / unreachable. Pairs with
 * `clientApiWrite` + `isOfflineWriteError` (lib/offline-write.ts) so wallets,
 * reserves, categories, settings, drafts — every data change — speaks with one
 * voice instead of a per-feature "couldn't save" generic.
 *
 * The spendings quick-entry keeps its richer AlertDialog (a deliberate add action
 * deserves a modal); passive saves (slider blur, toggle, reorder, form submit)
 * use this non-blocking toast.
 */
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function useOfflineWriteToast() {
  const t = useTranslations("offline");
  return useCallback(() => {
    toast.error(t("writeBlocked"));
  }, [t]);
}
