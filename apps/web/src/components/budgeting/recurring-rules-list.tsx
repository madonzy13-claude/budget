"use client";

/**
 * recurring-rules-list.tsx — list of active recurring rules with cadence
 * badge, next-due date, edit + delete actions.
 *
 * UAT-Phase6-Test7 post-fix:
 *   - Archive button → red trash icon-button. The destructive intent
 *     is signalled by the icon and tint; the confirm dialog lives in
 *     the parent recurring-section.tsx, not here.
 *   - Amount column reuses the spendings-grid formatter so "30.00" /
 *     "1500" render with the same shape (whole number → no fraction,
 *     fractional → padded to two digits). The list receives amounts
 *     in API-decimal form (e.g. "1500.0000"), so we normalize via
 *     `formatAmountForList` before display.
 */
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { formatShortDate } from "@/lib/format-date";

export interface RecurringRuleListItem {
  id: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  kind: string;
  // Backend v1.1 (Plan 02-02): DAILY|WEEKLY|MONTHLY|YEARLY. The list
  // accepts the wider union so YEARLY rules in the DB render correctly;
  // the create-form only offers WEEKLY/MONTHLY/YEARLY in the picker
  // (DAILY is a backend-only escape hatch we don't expose in the UI).
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  note: string | null;
  nextDueDate: string;
  active: boolean;
}

export interface RecurringRulesListProps {
  rules: RecurringRuleListItem[];
  /** Budget's default currency — informational; the row still shows the rule's own currency. */
  defaultCurrency?: string;
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
}

/**
 * Format the API amount string ("1500", "1500.0000", "30.5") the way the
 * spendings grid does: drop a trailing `.00`, pad a non-zero fraction to
 * two digits. Mirrors `centsToBare` semantics without going through cents,
 * since recurring rules store decimal amounts (not cents).
 */
export function formatAmountForList(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const whole = Math.trunc(Math.abs(n));
  const frac = Math.round((Math.abs(n) - whole) * 100);
  const sign = n < 0 ? "-" : "";
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Render a recurring rule's decimal amount with a short currency sign ($, kr,
 * zł, ₴) instead of the ISO code. Reuses the shared cents formatter (narrow
 * symbol, drops a `.00`) by lifting the decimal amount to integer cents.
 */
export function moneyForList(
  amount: string,
  currency: string,
  locale: string,
): string {
  const n = Number(amount);
  const cents = Number.isFinite(n) ? String(Math.round(n * 100)) : "0";
  return centsToDisplayCompact(cents, currency, locale, true);
}

/** Upcoming-first: soonest nextDueDate at the top (YYYY-MM-DD sorts lexically). */
export function sortRulesByUpcoming<T extends { nextDueDate: string }>(
  rules: T[],
): T[] {
  return [...rules].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

export function RecurringRulesList({
  rules,
  onEdit,
  onArchive,
}: RecurringRulesListProps) {
  const t = useTranslations("budgeting.recurring");
  const locale = useLocale();

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
      {sortRulesByUpcoming(rules).map((rule) => {
        const cadenceLabel =
          rule.cadence === "MONTHLY"
            ? t("list.monthlyOnDay", { day: rule.cadenceAnchor ?? 1 })
            : rule.cadence === "WEEKLY"
              ? t("list.weeklyOnDow", {
                  weekday: t(`rule.weekdays.${rule.weeklyDow ?? 1}`),
                })
              : rule.cadence === "YEARLY"
                ? t("list.yearlyOn", {
                    month: t(`rule.months.${rule.yearlyMonth ?? 1}`),
                    day: rule.cadenceAnchor ?? 1,
                  })
                : t("list.daily");
        return (
          <li
            key={rule.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium">
                <span className="tabular-nums">
                  {moneyForList(rule.amount, rule.currency, locale)}
                </span>{" "}
                <span className="text-[var(--muted-foreground)]">
                  · {cadenceLabel}
                </span>
              </p>
              <p className="text-xs text-[var(--muted-foreground)] truncate">
                {t("list.nextDueLabel", {
                  date: formatShortDate(rule.nextDueDate, locale),
                })}
                {rule.note ? ` — ${rule.note}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit?.(rule.id)}
                aria-label={t("list.editButton")}
                title={t("list.editButton")}
                className="h-9 w-9 text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onArchive?.(rule.id)}
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
