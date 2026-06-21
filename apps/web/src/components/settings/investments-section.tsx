"use client";
/**
 * investments-section.tsx — Settings toggle for investments_enabled (Phase 9).
 *
 * Mirrors cushion-section's master flag: optimistic local flip + PATCH
 * /budgets/:id { investments_enabled }, rollback + toast on error. Reuses the
 * existing <Switch>. Copy from budget.investments.feature_* (T-9-18: the flag is
 * convenience — the API enforces RLS + membership regardless of client render).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface InvestmentsSectionProps {
  budgetId: string;
  investmentsEnabled: boolean;
}

export function InvestmentsSection({
  budgetId,
  investmentsEnabled,
}: InvestmentsSectionProps) {
  const t = useTranslations("budget.investments");
  const [enabled, setEnabled] = useState(investmentsEnabled);
  const [saving, setSaving] = useState(false);

  async function handleEnabledChange(checked: boolean) {
    setEnabled(checked);
    setSaving(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { investments_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update investments flag");
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
        data-testid="settings-investments-toggle"
        className="shrink-0"
      />
    </div>
  );
}
