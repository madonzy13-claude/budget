"use client";
/**
 * aggregation-section.tsx — Settings self-toggle for include_in_aggregation
 * (Task 11, all-budgets aggregate overview).
 *
 * Clone of reserves-section.tsx's shape: optimistic local flip → PUT
 * /budgets/:id/aggregation { included }, rollback + toast on error. Unlike the
 * other feature-flag sections this is NOT owner-gated (Task 8's route binds the
 * caller's own userId as both actor and target row) — every member decides for
 * themselves whether this budget counts toward THEIR personal all-budgets total.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface AggregationSectionProps {
  budgetId: string;
  includeInAggregation: boolean;
}

export function AggregationSection({
  budgetId,
  includeInAggregation,
}: AggregationSectionProps) {
  const t = useTranslations("budget.aggregation");
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(includeInAggregation);
  const [saving, setSaving] = useState(false);

  async function handleChange(checked: boolean) {
    setEnabled(checked);
    setSaving(true);
    try {
      const res = await api.budgets[":id"].aggregation.$put({
        param: { id: budgetId },
        json: { included: checked },
      });
      if (!res.ok) throw new Error("Failed to update aggregation flag");
      // The all-budgets aggregate + this budget's own detail query both read
      // include_in_aggregation — invalidate both so the toggle takes effect
      // without a reload.
      qc.invalidateQueries({ queryKey: ["budgets", "aggregate"] });
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
        onCheckedChange={handleChange}
        disabled={saving}
        aria-label={t("feature_label")}
        data-testid="settings-aggregation-toggle"
        className="shrink-0"
      />
    </div>
  );
}
