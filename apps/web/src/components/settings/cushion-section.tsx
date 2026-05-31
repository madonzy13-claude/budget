"use client";

/**
 * cushion-section.tsx — Phase 6 onboarding rewrite + Phase 7 plan 09.
 *
 * The Settings "Cushion" section combines three controls:
 *
 *   1. cushion_enabled (master)  — toggles the whole cushion feature.
 *      When OFF, the cushion lane disappears everywhere: wallets tab
 *      Cushion section, category-edit cushion field, and the
 *      sub-controls below.
 *
 *   2. cushion_target_months (Phase 7 D-PH7-32/33) — the desired
 *      cushion runway in months. Saved on blur via PATCH /budgets/:id;
 *      single round-trip per change. Triggers a re-fetch of
 *      /budgets/:id/cushion-summary for the live preview below.
 *
 *   3. cushion_mode_enabled (mode) — when the master is ON, lets the
 *      owner switch the CURRENT month between NORMAL and CUSHION mode.
 *      Routed through toggleBudgetMode so SCD-2 history stays in sync.
 *
 * All writes go through PATCH /budgets/:id; the route layer handles
 * the SCD-2 sync for cushion_mode_enabled and a plain UPDATE for the
 * master flag and cushion_target_months.
 *
 * The live preview line below the months input reads
 * GET /budgets/:id/cushion-summary (Plan 07-07) and shows
 * actual/required/shortfall in the budget currency via Intl.NumberFormat.
 * shortfall_cents > 0 → --trading-down; shortfall_cents ≤ 0 → --trading-up.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface CushionSectionProps {
  budgetId: string;
  /** Master feature flag — gates the cushion lane everywhere. */
  cushionEnabled: boolean;
  /** Per-month mode — only meaningful when cushionEnabled is true. */
  cushionModeEnabled: boolean;
  /** Phase 7-09: desired cushion runway in months (1..60). Default 6. */
  cushionTargetMonths?: number;
  /** Budget currency for Intl.NumberFormat preview formatting. */
  budgetCurrency?: string;
}

interface CushionSummaryPayload {
  required_cents: string;
  actual_cents: string;
  shortfall_cents: string;
  currency: string;
  enabled: boolean;
  target_months: number;
}

function formatCurrency(cents: string, currency: string): string {
  const n = Number(cents) / 100;
  if (!Number.isFinite(n)) return `${cents} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function CushionSection({
  budgetId,
  cushionEnabled,
  cushionModeEnabled,
  cushionTargetMonths,
  budgetCurrency,
}: CushionSectionProps) {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(cushionEnabled);
  const [mode, setMode] = useState(cushionModeEnabled);
  const [savingFlag, setSavingFlag] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [targetMonths, setTargetMonths] = useState<number>(
    cushionTargetMonths ?? 6,
  );
  const [targetMonthsError, setTargetMonthsError] = useState<string | null>(
    null,
  );
  const queryClient = useQueryClient();

  // Phase 7-09: live cushion summary preview. Only fires when master is on.
  const {
    data: cushionSummary,
    isLoading: previewLoading,
    isError: previewError,
  } = useQuery({
    queryKey: ["cushion-summary", budgetId],
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/cushion-summary`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok)
        throw new Error(`Cushion summary fetch failed: ${res.status}`);
      return (await res.json()) as CushionSummaryPayload;
    },
    enabled,
  });

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

  /** Months input — save on blur with single PATCH round-trip. */
  async function handleTargetMonthsBlur() {
    if (
      !Number.isInteger(targetMonths) ||
      targetMonths < 1 ||
      targetMonths > 60
    ) {
      setTargetMonthsError(t("cushion.targetMonthsError"));
      return;
    }
    setTargetMonthsError(null);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { cushion_target_months: targetMonths },
      });
      if (!res.ok) throw new Error("Failed to update cushion_target_months");
      toast.success(t("cushion.saved"));
      queryClient.invalidateQueries({
        queryKey: ["cushion-summary", budgetId],
      });
    } catch {
      toast.error(t("error_save"));
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

  const renderPreview = () => {
    if (previewLoading) {
      return (
        <span className="inline-block h-4 w-48 rounded animate-pulse bg-[var(--surface-elevated-dark)]" />
      );
    }
    if (previewError) {
      return (
        <span className="text-[var(--muted-foreground)]">
          {t("cushion.previewError")}
        </span>
      );
    }
    if (!cushionSummary) return null;
    const currency =
      cushionSummary.currency || budgetCurrency || "USD";
    const shortfall = BigInt(cushionSummary.shortfall_cents);
    const positive = shortfall > 0n;
    return (
      <span
        className={
          positive
            ? "text-[var(--trading-down)]"
            : "text-[var(--trading-up)]"
        }
      >
        {positive
          ? t("cushion.preview", {
              actual: formatCurrency(cushionSummary.actual_cents, currency),
              required: formatCurrency(cushionSummary.required_cents, currency),
              shortfall: formatCurrency(
                cushionSummary.shortfall_cents,
                currency,
              ),
            })
          : t("cushion.previewMet", {
              actual: formatCurrency(cushionSummary.actual_cents, currency),
              required: formatCurrency(cushionSummary.required_cents, currency),
            })}
      </span>
    );
  };

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

      {/* Phase 7-09: months input + live cushion-summary preview.
          Hidden entirely when master toggle is off — same hiding
          policy as the per-month mode below. */}
      {enabled && (
        <div className="space-y-3 border-t border-[var(--hairline-on-dark)] pt-5">
          <div className="flex items-center gap-3">
            <label
              htmlFor="cushion-target-months"
              className="text-sm text-[var(--body-on-dark)]"
            >
              {t("cushion.targetMonthsLabel")}
            </label>
            <Input
              id="cushion-target-months"
              type="number"
              min={1}
              max={60}
              step={1}
              value={targetMonths}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setTargetMonths(Number.isNaN(v) ? 0 : v);
              }}
              onBlur={handleTargetMonthsBlur}
              aria-describedby="cushion-preview cushion-target-error"
              aria-invalid={targetMonthsError !== null ? "true" : undefined}
              className="w-24"
            />
          </div>
          {targetMonthsError && (
            <p
              id="cushion-target-error"
              className="text-xs text-[var(--trading-down)]"
            >
              {targetMonthsError}
            </p>
          )}
          <p
            id="cushion-preview"
            aria-live="polite"
            className="text-xs tabular-nums"
          >
            {renderPreview()}
          </p>
        </div>
      )}

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
