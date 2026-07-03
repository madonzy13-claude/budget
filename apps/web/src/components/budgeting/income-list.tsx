"use client";

/**
 * income-list.tsx — list of a budget's incomes (r32).
 * Name + short-currency amount + cadence label + edit/delete, mirroring
 * recurring-rules-list. Reuses the shared amount formatters.
 */
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moneyForList } from "@/components/budgeting/recurring-rules-list";

// Re-exported so income-form can prefill amounts with the same formatting.
export { formatAmountForList } from "@/components/budgeting/recurring-rules-list";

export type IncomeCadenceLite = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface IncomeListItem {
  id: string;
  name: string;
  amount: string;
  currency: string;
  cadence: IncomeCadenceLite;
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
}

export interface IncomeListProps {
  incomes: IncomeListItem[];
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
}

export function IncomeList({ incomes, onEdit, onArchive }: IncomeListProps) {
  const t = useTranslations("budgeting.income");
  const locale = useLocale();

  if (incomes.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-card-dark)] px-6 py-10 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("list.empty")}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] rounded-xl bg-[var(--surface-card-dark)]">
      {incomes.map((income) => {
        const cadenceLabel =
          income.cadence === "MONTHLY"
            ? t("list.monthlyOnDay", { day: income.cadenceAnchor ?? 1 })
            : income.cadence === "WEEKLY"
              ? t("list.weeklyOnDow", {
                  weekday: t(`form.weekdays.${income.weeklyDow ?? 1}`),
                })
              : income.cadence === "YEARLY"
                ? t("list.yearlyOn", {
                    month: t(`form.months.${income.yearlyMonth ?? 1}`),
                    day: income.cadenceAnchor ?? 1,
                  })
                : t("list.daily");
        return (
          <li
            key={income.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-[var(--body-on-dark)] truncate">
                {income.name}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                <span className="tabular-nums">
                  {moneyForList(income.amount, income.currency, locale)}
                </span>{" "}
                · {cadenceLabel}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit?.(income.id)}
                aria-label={t("list.editButton")}
                title={t("list.editButton")}
                className="h-9 w-9 text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onArchive?.(income.id)}
                aria-label={t("delete.title")}
                title={t("delete.title")}
                className="h-9 w-9 text-[var(--destructive)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
