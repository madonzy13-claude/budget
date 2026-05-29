"use client";

/**
 * share-override-editor.tsx — Live sum-100 counter for per-category share overrides.
 * Per UI-SPEC §ShareOverrides:
 *   - Caption: "Currently X% — must equal 100%"
 *   - Save disabled when |sum - 100| > 0.005
 *   - Red warning when sum ≠ 100
 */
import { useState, useCallback, useMemo } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ShareEntry {
  userId: string;
  percentage: string;
}

interface ShareOverrideEditorProps {
  categoryId: string;
  /** Pre-filled member list (userId + display name). */
  members?: Array<{ userId: string; name: string }>;
  /** Existing overrides from server. */
  existingOverrides?: ShareEntry[];
  onSuccess?: (overrides: ShareEntry[]) => void;
  apiBase?: string;
}

const EPSILON = 0.005;

export function ShareOverrideEditor({
  categoryId,
  members = [],
  existingOverrides = [],
  onSuccess,
  apiBase = "/api",
}: ShareOverrideEditorProps) {
  const t = useTranslations("budgeting_categories.shares");
  const [entries, setEntries] = useState<ShareEntry[]>(
    existingOverrides.length > 0
      ? existingOverrides
      : members.map((m) => ({ userId: m.userId, percentage: "" })),
  );
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const sum = useMemo(() => {
    return entries.reduce((acc, e) => {
      const n = parseFloat(e.percentage);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
  }, [entries]);

  const sumOk = Math.abs(sum - 100) <= EPSILON;

  const updatePercentage = useCallback((userId: string, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.userId === userId ? { ...e, percentage: value } : e)),
    );
  }, []);

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, { userId: "", percentage: "" }]);
  }, []);

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateUserId = useCallback((index: number, value: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, userId: value } : e)),
    );
  }, []);

  async function handleSave() {
    if (!sumOk) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch(
        `${apiBase}/categories/${categoryId}/share-overrides`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ entries }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setServerError(err?.message ?? t("errors.saveFailed"));
        return;
      }
      toast.success(t("toast.saved"));
      onSuccess?.(entries);
    } catch {
      setServerError(t("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  const sumDisplay = Number.isInteger(sum) ? sum.toString() : sum.toFixed(2);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("title")}</h3>

      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {entries.map((entry, idx) => {
          const member = members.find((m) => m.userId === entry.userId);
          return (
            <div key={idx} className="flex items-center gap-2">
              {member ? (
                <span className="flex-1 text-sm">{member.name}</span>
              ) : (
                <Input
                  className="flex-1"
                  placeholder={t("userIdPlaceholder")}
                  value={entry.userId}
                  onChange={(e) => updateUserId(idx, e.target.value)}
                />
              )}
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-20 text-right"
                  value={entry.percentage}
                  onChange={(e) =>
                    updatePercentage(entry.userId || `__${idx}`, e.target.value)
                  }
                  aria-label={t("sharePercentageAria", {
                    name: member?.name ?? entry.userId,
                  })}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(idx)}
                className="p-1 rounded hover:bg-muted"
                aria-label={t("removeEntryAria")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("addMember")}
      </button>

      {/* Live sum counter — acceptance criteria exact string */}
      <p
        className={cn(
          "text-sm",
          sumOk ? "text-muted-foreground" : "text-destructive font-medium",
        )}
        aria-live="polite"
        data-testid="sum-counter"
      >
        {t("sumCounter", { sum: sumDisplay })}
      </p>

      <div className="flex gap-2 justify-end">
        <Button
          onClick={handleSave}
          disabled={saving || !sumOk}
          aria-disabled={!sumOk}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
