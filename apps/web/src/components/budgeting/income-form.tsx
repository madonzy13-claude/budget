"use client";

/**
 * income-form.tsx — Right-side slider to create/edit an Income (r32).
 *
 * Mirrors recurring-rule-form's chrome + cadence picker, minus the
 * category/note/first-due machinery, plus a required Name field. Both create
 * and edit POST/PATCH the FULL record (name + amount + currency + discriminated
 * cadence) so the frequency can be changed on edit.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyPicker } from "@/components/common/currency-picker";
import {
  formatAmountForList,
  type IncomeCadenceLite,
} from "@/components/budgeting/income-list";
import { WEEKDAY_ORDER } from "@/components/budgeting/recurring-rule-form";
import { uuidv4 } from "@/lib/uuid";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

type UiCadence = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface IncomeFormValues {
  incomeId?: string;
  name: string;
  amount: string;
  currency: string;
  cadence: IncomeCadenceLite;
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
}

export interface IncomeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  budgetId?: string;
  defaultCurrency?: string;
  initialValues?: Partial<IncomeFormValues>;
  onSaved?: () => void;
  fetchImpl?: typeof fetch;
}

export function IncomeForm({
  open,
  onOpenChange,
  mode,
  budgetId,
  defaultCurrency,
  initialValues,
  onSaved,
  fetchImpl,
}: IncomeFormProps) {
  const t = useTranslations("budgeting.income");
  const offlineToast = useOfflineWriteToast();

  const [name, setName] = useState(initialValues?.name ?? "");
  const [amount, setAmount] = useState(
    initialValues?.amount ? formatAmountForList(initialValues.amount) : "",
  );
  const [currency, setCurrency] = useState(
    initialValues?.currency ?? defaultCurrency ?? "USD",
  );
  const initialCadence: UiCadence =
    initialValues?.cadence === "WEEKLY" ||
    initialValues?.cadence === "MONTHLY" ||
    initialValues?.cadence === "YEARLY"
      ? initialValues.cadence
      : "MONTHLY";
  const [cadence, setCadence] = useState<UiCadence>(initialCadence);
  const [cadenceAnchorRaw, setCadenceAnchorRaw] = useState<string>(
    String(initialValues?.cadenceAnchor ?? 1),
  );
  const [weeklyDow, setWeeklyDow] = useState<number>(
    initialValues?.weeklyDow ?? WEEKDAY_ORDER[0]!,
  );
  const [yearlyMonth, setYearlyMonth] = useState<number>(
    initialValues?.yearlyMonth ?? 1,
  );
  const [saving, setSaving] = useState(false);

  const doFetch = fetchImpl
    ? fetchImpl
    : (url: string, init?: RequestInit) =>
        clientApiWrite(url.replace(/^\/api/, ""), init ?? {});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const parsedAnchor = parseInt(cadenceAnchorRaw, 10);
      const anchor = Number.isFinite(parsedAnchor)
        ? Math.max(1, Math.min(31, parsedAnchor))
        : 1;
      const cadencePart: Record<string, unknown> =
        cadence === "WEEKLY"
          ? { cadence: "WEEKLY", weekly_dow: weeklyDow }
          : cadence === "MONTHLY"
            ? { cadence: "MONTHLY", cadence_anchor: anchor }
            : {
                cadence: "YEARLY",
                yearly_month: yearlyMonth,
                cadence_anchor: anchor,
              };
      const payload = JSON.stringify({
        name,
        amount,
        currency,
        ...cadencePart,
      });
      const headers = {
        "Content-Type": "application/json",
        "Idempotency-Key": uuidv4(),
        ...(budgetId ? { "X-Budget-ID": budgetId } : {}),
      };

      if (mode === "create") {
        const url = budgetId
          ? `/api/budgets/${budgetId}/incomes`
          : "/api/incomes";
        const res = await doFetch(url, {
          method: "POST",
          headers,
          body: payload,
        });
        if (!res.ok) {
          toast.error(t("errors.create"));
          return;
        }
      } else {
        const id = initialValues?.incomeId;
        if (!id) return;
        const url = budgetId
          ? `/api/budgets/${budgetId}/incomes/${id}`
          : `/api/incomes/${id}`;
        const res = await doFetch(url, {
          method: "PATCH",
          headers,
          body: payload,
        });
        if (!res.ok) {
          toast.error(t("errors.update"));
          return;
        }
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t(mode === "create" ? "errors.create" : "errors.update"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-6 py-4 border-b border-[var(--hairline-dark)]">
          <SheetTitle>
            {mode === "create" ? t("form.title") : t("form.editTitle")}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <Label htmlFor="income-name">{t("form.nameLabel")}</Label>
              <Input
                id="income-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                required
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <Label htmlFor="income-amount">{t("form.amountLabel")}</Label>
                <Input
                  id="income-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="w-32">
                <Label>{t("form.currencyLabel")}</Label>
                <CurrencyPicker
                  value={currency}
                  onSelect={setCurrency}
                  variant="field"
                />
              </div>
            </div>

            <div>
              <Label>{t("form.cadenceLabel")}</Label>
              <div className="flex gap-2 pt-1">
                {(["WEEKLY", "MONTHLY", "YEARLY"] as const).map((cad) => (
                  <Button
                    key={cad}
                    type="button"
                    data-testid={`income-cadence-${cad}`}
                    variant={cadence === cad ? "primary" : "outline"}
                    onClick={() => setCadence(cad)}
                    className="flex-1"
                  >
                    {t(`form.${cad.toLowerCase()}`)}
                  </Button>
                ))}
              </div>
            </div>

            {cadence === "WEEKLY" && (
              <div>
                <Label htmlFor="income-dow">{t("form.weekdayLabel")}</Label>
                <Select
                  value={String(weeklyDow)}
                  onValueChange={(v) => setWeeklyDow(parseInt(v, 10))}
                >
                  <SelectTrigger id="income-dow">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_ORDER.map((dow) => (
                      <SelectItem key={dow} value={String(dow)}>
                        {t(`form.weekdays.${dow}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cadence === "MONTHLY" && (
              <div>
                <Label htmlFor="income-anchor">
                  {t("form.anchorDayLabel")}
                </Label>
                <Input
                  id="income-anchor"
                  type="number"
                  min={1}
                  max={31}
                  value={cadenceAnchorRaw}
                  onChange={(e) => setCadenceAnchorRaw(e.target.value)}
                />
              </div>
            )}

            {cadence === "YEARLY" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="income-yearly-month">
                    {t("form.yearlyMonthLabel")}
                  </Label>
                  <Select
                    value={String(yearlyMonth)}
                    onValueChange={(v) => setYearlyMonth(parseInt(v, 10))}
                  >
                    <SelectTrigger id="income-yearly-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {t(`form.months.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="income-yearly-day">
                    {t("form.anchorDayLabel")}
                  </Label>
                  <Input
                    id="income-yearly-day"
                    type="number"
                    min={1}
                    max={31}
                    value={cadenceAnchorRaw}
                    onChange={(e) => setCadenceAnchorRaw(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <SheetFooter className="border-t border-[var(--hairline-dark)] px-6 py-4">
            <Button type="submit" disabled={saving} data-testid="income-save">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("form.saveButton")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
