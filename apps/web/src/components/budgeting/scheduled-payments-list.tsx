"use client";

/**
 * scheduled-payments-list.tsx — list of active scheduled rules with cadence
 * badge, next-due date, edit + delete actions.
 *
 * UAT-Phase6-Test7 post-fix:
 *   - Archive button → red trash icon-button. The destructive intent
 *     is signalled by the icon and tint; the confirm dialog lives in
 *     the parent scheduled-payments-section.tsx, not here.
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

export interface ScheduledPaymentListItem {
  id: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  kind: string;
  // Backend: ONCE|DAILY|WEEKLY|MONTHLY|YEARLY. The list accepts the whole
  // union so every row in the DB renders; the create-form offers ONCE and the
  // three rhythms (DAILY is a backend-only escape hatch we don't expose).
  cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  /** True once one of its drafts has been confirmed — the money moved, so the
   *  payment can be removed but no longer edited. */
  hasConfirmedDraft?: boolean;
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  note: string | null;
  nextDueDate: string;
  /** Optional "last date" — null = no deadline (mig 0069). */
  endDate?: string | null;
  active: boolean;
}

export interface ScheduledPaymentsListProps {
  rules: ScheduledPaymentListItem[];
  /** Budget's default currency — informational; the row still shows the rule's own currency. */
  defaultCurrency?: string;
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
}

/**
 * Format the API amount string ("1500", "1500.0000", "30.5") the way the
 * spendings grid does: drop a trailing `.00`, pad a non-zero fraction to
 * two digits. Mirrors `centsToBare` semantics without going through cents,
 * since scheduled rules store decimal amounts (not cents).
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
 * Render a scheduled rule's decimal amount with a short currency sign ($, kr,
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
export function sortRulesByUpcoming<
  T extends { nextDueDate: string; active?: boolean },
>(rules: T[]): T[] {
  // Retired payments sink, whatever their date: a one-time payment that has
  // happened is over, not gone, and burying it keeps the list about what is
  // still coming (user, 260807). A row with no flag at all is treated as
  // running — the offline cache holds rows written before the flag existed, and
  // guessing "retired" would hide a live payment.
  const retired = (r: T) => (r.active === false ? 1 : 0);
  return [...rules].sort(
    (a, b) =>
      retired(a) - retired(b) || a.nextDueDate.localeCompare(b.nextDueDate),
  );
}

export function ScheduledPaymentsList({
  rules,
  onEdit,
  onArchive,
}: ScheduledPaymentsListProps) {
  const t = useTranslations("budgeting.scheduled");
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
          // A one-time payment has no rhythm to describe — the date IS the
          // description, so it reads as the word plus the day (260807).
          rule.cadence === "ONCE"
            ? t("list.once")
            : rule.cadence === "MONTHLY"
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
        // Over, not gone: a one-time payment keeps its place at the bottom and
        // reads as spent rather than as something still coming.
        //
        // ONLY a one-time payment. An inactive RHYTHM is a payment somebody
        // deleted — "inactive" is the only mark deletions carried before
        // deleted_at existed — and dimming those brought years of them back
        // looking alive (user screenshot, 260807).
        const retired = rule.active === false && rule.cadence === "ONCE";
        return (
          <li
            key={rule.id}
            data-retired={retired ? "true" : undefined}
            className={`flex items-center justify-between px-4 py-3 ${
              retired ? "opacity-50" : ""
            }`}
          >
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-[var(--body-on-dark)] truncate">
                {rule.note?.trim() || t("list.untitled")}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                <span className="tabular-nums">
                  {moneyForList(rule.amount, rule.currency, locale)}
                </span>{" "}
                · {cadenceLabel}
              </p>
              <p className="text-xs text-[var(--muted-foreground)] truncate">
                {t("list.nextDueLabel", {
                  date: formatShortDate(rule.nextDueDate, locale),
                })}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {/* Editing a ONE-TIME payment whose draft is already confirmed
                  would be editing history — the money has moved, and it has no
                  next occurrence to change. A rhythm always keeps its edit:
                  confirming this July says nothing about next July (user,
                  260807). Removing it is offered either way. */}
              {!(rule.hasConfirmedDraft && rule.cadence === "ONCE") && (
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
              )}
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
