"use client";

/**
 * cushion-section.tsx — Phase 6 onboarding rewrite.
 *
 * The Settings "Cushion" section combines two distinct flags:
 *
 *   1. cushion_enabled (master)  — toggles the whole cushion feature.
 *      When OFF, the cushion lane disappears everywhere: wallets tab
 *      Cushion section, category-edit cushion field, and the second
 *      sub-toggle below.
 *
 *   2. cushion_mode_enabled (mode) — when the master is ON, lets the
 *      owner switch the CURRENT month between NORMAL and CUSHION mode.
 *      Routed through toggleBudgetMode so SCD-2 history stays in sync.
 *
 * Both writes go through PATCH /budgets/:id; the route layer handles
 * the SCD-2 sync for cushion_mode_enabled and a plain UPDATE for the
 * master flag.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface CushionSectionProps {
  budgetId: string;
  /** Master feature flag — gates the cushion lane everywhere. */
  cushionEnabled: boolean;
  /** Per-month mode — only meaningful when cushionEnabled is true. */
  cushionModeEnabled: boolean;
}

export function CushionSection({
  budgetId,
  cushionEnabled,
  cushionModeEnabled,
}: CushionSectionProps) {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(cushionEnabled);
  const [mode, setMode] = useState(cushionModeEnabled);
  const [savingFlag, setSavingFlag] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  /** Master feature flag — turn the cushion lane on / off entirely. */
  async function handleEnabledChange(checked: boolean) {
    setEnabled(checked);
    setSavingFlag(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { cushion_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update cushion flag");
      // Disabling the master flag should leave the per-month mode at
      // whatever the user previously chose — the route layer reads
      // cushion_enabled separately, so we don't need to force the mode
      // back to NORMAL here. Hiding the sub-toggle below is enough.
      toast.success(
        checked
          ? t("cushion.feature_on_toast")
          : t("cushion.feature_off_toast"),
      );
    } catch {
      setEnabled(!checked);
      toast.error(t("error_save"));
    } finally {
      setSavingFlag(false);
    }
  }

  /** Per-month NORMAL ↔ CUSHION mode — only when the master is on. */
  async function handleModeChange(checked: boolean) {
    setMode(checked);
    setSavingMode(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { cushion_mode_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update cushion mode");
      toast.success(checked ? t("cushion.on_toast") : t("cushion.off_toast"));
    } catch {
      setMode(!checked);
      toast.error(t("error_save"));
    } finally {
      setSavingMode(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-[var(--body)]">
            {t("cushion.feature_label")}
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("cushion.feature_help_text")}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleEnabledChange}
          disabled={savingFlag}
          aria-label={t("cushion.feature_label")}
          className="shrink-0"
        />
      </div>

      {/* Per-month mode — hidden entirely when master is off, per the
          UX requirement that disabling the master should also hide the
          mode toggle (not just gray it out). */}
      {enabled && (
        <div className="border-t border-[var(--hairline-on-dark)] pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-[var(--body)]">
                {t("cushion.mode_label")}
              </p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {t("cushion.mode_help_text")}
              </p>
            </div>
            <Switch
              checked={mode}
              onCheckedChange={handleModeChange}
              disabled={savingMode}
              aria-label={t("cushion.mode_label")}
              className="shrink-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
