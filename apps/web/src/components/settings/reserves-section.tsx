"use client";
/**
 * reserves-section.tsx — Settings toggle for reserves_enabled (Phase 11 UAT).
 *
 * Mirrors investments-section's master flag: optimistic local flip + PATCH
 * /budgets/:id { reserves_enabled }, rollback + toast on error. Off hides the
 * Reserves tab (BdpTabs cascading-hide, D-PH5-R11) AND every reserves item on
 * the Overview tab (card + section). The API enforces RLS + membership
 * regardless of client render — the flag is a convenience.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface ReservesSectionProps {
  budgetId: string;
  reservesEnabled: boolean;
}

export function ReservesSection({
  budgetId,
  reservesEnabled,
}: ReservesSectionProps) {
  const t = useTranslations("budget.reserves");
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(reservesEnabled);
  const [saving, setSaving] = useState(false);

  async function handleEnabledChange(checked: boolean) {
    setEnabled(checked);
    setSaving(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { reserves_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update reserves flag");
      // BdpTabs + the Overview read reservesEnabled from the budget-detail query;
      // invalidate it so the pill/cards/section appear/disappear WITHOUT a reload.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      toast.success(checked ? t("feature_on_toast") : t("feature_off_toast"));
    } catch {
      setEnabled(!checked);
      toast.error(t("error_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("feature_label")}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("feature_help_text")}
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleEnabledChange}
        disabled={saving}
        aria-label={t("feature_label")}
        data-testid="settings-reserves-toggle"
        className="shrink-0"
      />
    </div>
  );
}
