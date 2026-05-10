"use client";

/**
 * recurring-rule-form.tsx — Dialog for creating + editing recurring rules.
 * Per UI-SPEC + D-01-d: in edit mode renders a pre-checked "Also apply to future occurrences"
 * checkbox; submit body sends `applyToFuture` matching the checkbox state.
 *
 * Modes:
 *   - create  → POST /recurring-rules                  (no checkbox)
 *   - edit    → PATCH /recurring-rules/:id             (checkbox pre-checked, defaultChecked={true})
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type RuleMode = "create" | "edit";

export interface RecurringRuleFormValues {
  ruleId?: string;
  accountId: string;
  categoryId: string | null;
  amount: string;
  currency: string;
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  cadence: "MONTHLY" | "WEEKLY";
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  note: string | null;
  firstDueDate: string;
}

export interface RecurringRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RuleMode;
  initialValues?: Partial<RecurringRuleFormValues>;
  onSaved?: () => void;
  /** For test override; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export function RecurringRuleForm({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSaved,
  fetchImpl,
}: RecurringRuleFormProps) {
  const t = useTranslations("budgeting.recurring");
  const [accountId, setAccountId] = useState(initialValues?.accountId ?? "");
  const [amount, setAmount] = useState(initialValues?.amount ?? "");
  const [currency, setCurrency] = useState(initialValues?.currency ?? "USD");
  const [kind, setKind] = useState<"EXPENSE" | "INCOME" | "TRANSFER">(
    initialValues?.kind ?? "EXPENSE",
  );
  const [cadence, setCadence] = useState<"MONTHLY" | "WEEKLY">(
    initialValues?.cadence ?? "MONTHLY",
  );
  const [cadenceAnchor, setCadenceAnchor] = useState<number | null>(
    initialValues?.cadenceAnchor ?? 1,
  );
  const [weeklyDow, setWeeklyDow] = useState<number | null>(
    initialValues?.weeklyDow ?? null,
  );
  const [firstDueDate, setFirstDueDate] = useState(
    initialValues?.firstDueDate ?? "",
  );
  const [note, setNote] = useState(initialValues?.note ?? "");
  // D-01-d: pre-checked in edit mode (form sends applyToFuture=true by default).
  const [applyToFuture, setApplyToFuture] = useState(true);
  const [saving, setSaving] = useState(false);

  const doFetch = fetchImpl ?? fetch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await doFetch("/api/recurring-rules", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            accountId,
            amount,
            currency,
            kind,
            cadence,
            cadenceAnchor: cadence === "MONTHLY" ? cadenceAnchor : null,
            weeklyDow: cadence === "WEEKLY" ? weeklyDow : null,
            firstDueDate,
            note: note || null,
          }),
        });
        if (!res.ok) {
          toast.error("Failed to create rule");
          return;
        }
      } else {
        // edit mode — D-01-d: send applyToFuture matching checkbox state
        const ruleId = initialValues?.ruleId;
        if (!ruleId) return;
        const res = await doFetch(`/api/recurring-rules/${ruleId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            edits: { amount, currency, note: note || null },
            applyToFuture,
          }),
        });
        if (!res.ok) {
          toast.error("Failed to update rule");
          return;
        }
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("rule.title") : t("rule.editTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rr-amount">{t("rule.amountLabel")}</Label>
              <Input
                id="rr-amount"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="rr-currency">{t("rule.currencyLabel")}</Label>
              <Input
                id="rr-currency"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={5}
                required
              />
            </div>
          </div>

          {mode === "create" && (
            <>
              <div>
                <Label htmlFor="rr-kind">{t("rule.kindLabel")}</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as typeof kind)}
                >
                  <SelectTrigger id="rr-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">
                      {t("rule.kindExpense")}
                    </SelectItem>
                    <SelectItem value="INCOME">
                      {t("rule.kindIncome")}
                    </SelectItem>
                    <SelectItem value="TRANSFER">
                      {t("rule.kindTransfer")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="rr-account">{t("rule.accountLabel")}</Label>
                <Input
                  id="rr-account"
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label>{t("rule.cadenceLabel")}</Label>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant={cadence === "MONTHLY" ? "default" : "outline"}
                    onClick={() => setCadence("MONTHLY")}
                  >
                    {t("rule.monthly")}
                  </Button>
                  <Button
                    type="button"
                    variant={cadence === "WEEKLY" ? "default" : "outline"}
                    onClick={() => setCadence("WEEKLY")}
                  >
                    {t("rule.weekly")}
                  </Button>
                </div>
              </div>

              {cadence === "MONTHLY" ? (
                <div>
                  <Label htmlFor="rr-anchor">{t("rule.anchorDayLabel")}</Label>
                  <Input
                    id="rr-anchor"
                    type="number"
                    min={1}
                    max={31}
                    value={cadenceAnchor ?? ""}
                    onChange={(e) =>
                      setCadenceAnchor(parseInt(e.target.value, 10) || 1)
                    }
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="rr-dow">{t("rule.weekdayLabel")}</Label>
                  <Select
                    value={String(weeklyDow ?? 1)}
                    onValueChange={(v) => setWeeklyDow(parseInt(v, 10))}
                  >
                    <SelectTrigger id="rr-dow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
                        <SelectItem key={dow} value={String(dow)}>
                          {t(`rule.weekdays.${dow}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="rr-firstdue">{t("rule.firstDueLabel")}</Label>
                <Input
                  id="rr-firstdue"
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="rr-note">{t("rule.noteLabel")}</Label>
            <Input
              id="rr-note"
              type="text"
              value={note ?? ""}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {mode === "edit" && (
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="rr-apply-future"
                checked={applyToFuture}
                defaultChecked={true}
                onCheckedChange={(v) => setApplyToFuture(v === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="rr-apply-future" className="cursor-pointer">
                  {t("rule.applyToFutureLabel")}
                </Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t("rule.applyToFutureHelp")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("rule.cancelButton")}
            </Button>
            <Button type="submit" disabled={saving}>
              {t("rule.saveButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
