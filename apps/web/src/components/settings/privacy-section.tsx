"use client";
/**
 * privacy-section.tsx — "hide amounts until I tap them", per member (260810).
 *
 * This used to be a row inside BudgetIdentitySection, which lives behind
 * OwnerGate — a disabled <fieldset> that switches off every control under it.
 * That was right while the flag was the budget's, and wrong the moment it
 * became the reader's: whether a screen redacts amounts answers who is standing
 * behind THIS person, so a member who is not the owner needs it most of all.
 *
 * So it sits beside AggregationSection instead: outside the gate, self-service,
 * writing the caller's own membership row (migration 0082).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface PrivacySectionProps {
  budgetId: string;
  /** This member's stored setting — off unless they asked for it. */
  amountPrivacyEnabled?: boolean;
}

export function PrivacySection({
  budgetId,
  amountPrivacyEnabled = false,
}: PrivacySectionProps) {
  const t = useTranslations("settings");
  const qc = useQueryClient();

  const [privacyOn, setPrivacyOn] = useState(amountPrivacyEnabled);
  const [saving, setSaving] = useState(false);
  useEffect(() => setPrivacyOn(amountPrivacyEnabled), [amountPrivacyEnabled]);

  const save = async (checked: boolean) => {
    setPrivacyOn(checked);
    setSaving(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { amount_privacy_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update amount-privacy flag");
      // The Overview reads the flag off this query — invalidate so the eye and
      // the redaction bars appear (or go) without a reload.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      toast.success(
        checked
          ? t("identity.privacy_on_toast")
          : t("identity.privacy_off_toast"),
      );
    } catch {
      setPrivacyOn(!checked);
      toast.error(t("identity.privacy_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    // items-start, like Reserves / Cushion / Investments / Net worth: the switch
    // belongs beside the TITLE, not floating between the two lines of text
    // (user, 260810).
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("identity.privacy_label")}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {t("identity.privacy_hint")}
        </p>
      </div>
      <Switch
        data-testid="amount-privacy-switch"
        checked={privacyOn}
        onCheckedChange={save}
        disabled={saving}
        aria-label={t("identity.privacy_label")}
        className="shrink-0"
      />
    </div>
  );
}
