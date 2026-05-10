"use client";

/**
 * recurring-rules-list.tsx — list of active recurring rules with cadence badge,
 * next-due, edit + archive actions.
 */
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export interface RecurringRuleListItem {
  id: string;
  amount: string;
  currency: string;
  kind: string;
  cadence: "MONTHLY" | "WEEKLY";
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  note: string | null;
  nextDueDate: string;
  active: boolean;
}

export interface RecurringRulesListProps {
  rules: RecurringRuleListItem[];
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
}

export function RecurringRulesList({
  rules,
  onEdit,
  onArchive,
}: RecurringRulesListProps) {
  const t = useTranslations("budgeting.recurring");

  if (rules.length === 0) {
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
      {rules.map((rule) => {
        const cadenceLabel =
          rule.cadence === "MONTHLY"
            ? t("list.monthlyOnDay", { day: rule.cadenceAnchor ?? 1 })
            : t("list.weeklyOnDow", {
                weekday: t(`rule.weekdays.${rule.weeklyDow ?? 1}`),
              });
        return (
          <li
            key={rule.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {rule.amount} {rule.currency}{" "}
                <span className="text-[var(--muted-foreground)]">
                  · {cadenceLabel}
                </span>
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t("list.nextDueLabel", { date: rule.nextDueDate })}
                {rule.note ? ` — ${rule.note}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit?.(rule.id)}
              >
                {t("list.editButton")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onArchive?.(rule.id)}
              >
                {t("list.archiveButton")}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
