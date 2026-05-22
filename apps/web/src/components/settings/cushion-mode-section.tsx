"use client";

/**
 * cushion-mode-section.tsx — D-02
 *
 * Switch persists instantly (PATCH cushion_mode_enabled) and shows toast.
 * No confirm dialog — fully reversible.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface CushionModeSectionProps {
  budgetId: string;
  cushionModeEnabled: boolean;
}

export function CushionModeSection({
  budgetId,
  cushionModeEnabled,
}: CushionModeSectionProps) {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(cushionModeEnabled);
  const [saving, setSaving] = useState(false);

  const handleChange = async (checked: boolean) => {
    setEnabled(checked);
    setSaving(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { cushion_mode_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update cushion mode");
      if (checked) {
        toast.success(t("cushion.on_toast"));
      } else {
        toast.success(t("cushion.off_toast"));
      }
    } catch {
      // revert on failure
      setEnabled(!checked);
      toast.error(t("error_save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-4">
      <Switch
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={saving}
        aria-label={t("cushion.label")}
      />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("cushion.label")}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("cushion.help_text")}
        </p>
      </div>
    </div>
  );
}
