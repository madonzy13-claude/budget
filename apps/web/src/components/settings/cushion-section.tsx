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
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { clientApiFetch } from "@/lib/budget-fetch";
import { centsToDisplayCompact } from "@/lib/cents-format";

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

export function CushionSection({
  budgetId,
  cushionEnabled,
  cushionModeEnabled,
  cushionTargetMonths,
  budgetCurrency,
}: CushionSectionProps) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [enabled, setEnabled] = useState(cushionEnabled);
  const [mode, setMode] = useState(cushionModeEnabled);
  const [savingFlag, setSavingFlag] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  // Bug fix (UAT round 3): keep input value as a *string* so the field can
  // hold the transient empty state (user backspacing all digits) without
  // collapsing to "0" and forcing "09" on the next keystroke. Parsed to
  // integer at validate / save time.
  const [targetMonthsRaw, setTargetMonthsRaw] = useState<string>(
    String(cushionTargetMonths ?? 6),
  );
  // Re-sync the input when the parent prop changes (e.g. after PATCH + page
  // reload propagates a new cushion_target_months from the server). Without
  // this effect the useState init only fires once, leaving the input pinned
  // to the stale initial value.
  useEffect(() => {
    setTargetMonthsRaw(String(cushionTargetMonths ?? 6));
  }, [cushionTargetMonths]);
  // 260625: re-sync the master/mode toggle state when the parent prop changes
  // after the refetchOnMount GET lands (warm cache → instant stale paint, then
  // fresh server value). Without these, the switch keeps the just-hydrated
  // STALE value (e.g. cushion_mode_enabled from the pre-toggle snapshot) and the
  // golden-timeline harness then read a stale aria-checked and SKIPPED the
  // toggle click → no PATCH → reserve recompute never ran. Guarded by saving*
  // so an in-flight optimistic toggle is not clobbered by an interleaved prop.
  useEffect(() => {
    if (!savingFlag) setEnabled(cushionEnabled);
  }, [cushionEnabled, savingFlag]);
  useEffect(() => {
    if (!savingMode) setMode(cushionModeEnabled);
  }, [cushionModeEnabled, savingMode]);
  const targetMonths = (() => {
    // UAT round 7 / 8: parseFloat (was parseInt) to accept fractional months
    // (e.g. 4.5). Normalize comma decimal separator to dot first so users on
    // PL/UK locales can type "4,5" and get the same result as "4.5". NaN
    // sentinel surfaces the inline error and suppresses PATCH.
    const normalized = targetMonthsRaw.replace(",", ".");
    const v = parseFloat(normalized);
    return Number.isFinite(v) ? v : Number.NaN;
  })();
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
      const res = await clientApiFetch(`/budgets/${budgetId}/cushion-summary`, {
        headers: { "X-Budget-ID": budgetId },
      });
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
      invalidateCushionAffected();
    } catch {
      setEnabled(!checked);
      toast.error(t("error_save"));
    } finally {
      setSavingFlag(false);
    }
  }

  /** Months input — save on blur with single PATCH round-trip.
   *  UAT round 7: accept fractional months (e.g. 4.5). Validate any finite
   *  number in [1..60]; integer-only constraint dropped (DB column is now
   *  numeric(4,1) — migration 0027). */
  async function handleTargetMonthsBlur() {
    if (
      !Number.isFinite(targetMonths) ||
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
      // The PATCH recomputes the CUSHION_BELOW_TARGET task server-side
      // (budget-identity route → recomputeCushionTask). Invalidate the shared
      // pending-tasks query so the BDP pill badge + per-pill slider reflect the
      // new shortfall immediately instead of waiting for the 60 s poll.
      queryClient.invalidateQueries({
        queryKey: ["tasks", budgetId, "pending"],
      });
      // Cash-flow projection inputs changed — refresh the banner.
      queryClient.invalidateQueries({
        queryKey: ["budget", budgetId, "projection"],
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
      invalidateCushionAffected();
    } catch {
      setMode(!checked);
      toast.error(t("error_save"));
    } finally {
      setSavingMode(false);
    }
  }

  /**
   * Cross-tab refresh after a cushion master/mode toggle. The toggle recomputes
   * reserve availability AND flips which limit (normal vs cushion) the spendings
   * grid shows for the affected month, but the BDP carousel reuses the warm cache
   * on tab switch — the Reserves + Spendings tabs would show the pre-toggle value.
   * Mark reserves, budget detail AND the spendings summary stale so all of them
   * revalidate (r32: spendings was previously skipped, so switching to CUSHION
   * left the grid on the old normal limits until a manual month nav / reload).
   */
  function invalidateCushionAffected() {
    queryClient.invalidateQueries({
      queryKey: ["budget", budgetId, "reserves"],
    });
    queryClient.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
    // The live target preview: enabling the master flag flips whether a cushion
    // requirement exists, and the enabled-gated query may have fetched the OLD
    // (feature-off, required=0) summary before the PATCH landed → refetch so the
    // "Have X of Y — target met" tip appears once the feature is on.
    queryClient.invalidateQueries({
      queryKey: ["cushion-summary", budgetId],
    });
    queryClient.invalidateQueries({
      queryKey: ["spendings-summary", budgetId],
    });
    // r36: switching cushion mode flips whether cushion wallets count toward the
    // income-vs-planned "available" total (and the overview available-to-spend),
    // so refresh the tasks list + overview.
    queryClient.invalidateQueries({
      queryKey: ["tasks", budgetId, "pending"],
    });
    queryClient.invalidateQueries({
      queryKey: ["budget", budgetId, "overview"],
    });
    // Cash-flow projection inputs changed — refresh the banner.
    queryClient.invalidateQueries({
      queryKey: ["budget", budgetId, "projection"],
    });
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
    // required_cents===0 means no cushion requirement configured (feature off OR
    // no cushion category limits) — nothing to preview; avoids the meaningless
    // "Have 0 of 0 — target met". Verified via get-cushion-summary.ts (zero DTO
    // when disabled; Σ limits × months = 0 when no cushion categories).
    if (BigInt(cushionSummary.required_cents) === 0n) return null;
    const currency = cushionSummary.currency || budgetCurrency || "USD";
    const shortfall = BigInt(cushionSummary.shortfall_cents);
    const positive = shortfall > 0n;
    return (
      <span
        className={
          positive ? "text-[var(--trading-down)]" : "text-[var(--trading-up)]"
        }
      >
        {positive
          ? t("cushion.preview", {
              actual: centsToDisplayCompact(
                cushionSummary.actual_cents,
                currency,
                locale,
              ),
              required: centsToDisplayCompact(
                cushionSummary.required_cents,
                currency,
                locale,
              ),
              shortfall: centsToDisplayCompact(
                cushionSummary.shortfall_cents,
                currency,
                locale,
              ),
            })
          : t("cushion.previewMet", {
              actual: centsToDisplayCompact(
                cushionSummary.actual_cents,
                currency,
                locale,
              ),
              required: centsToDisplayCompact(
                cushionSummary.required_cents,
                currency,
                locale,
              ),
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
              // UAT round 8: type="text" + inputMode="decimal" gives the
              // numeric keypad on iOS / Android while letting the user type a
              // comma decimal separator ("4,5") which the native
              // <input type="number"> rejects in many locales. Parse step
              // normalises comma → dot before the PATCH.
              type="text"
              inputMode="decimal"
              pattern="[0-9,.]*"
              value={targetMonthsRaw}
              onChange={(e) => setTargetMonthsRaw(e.target.value)}
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
