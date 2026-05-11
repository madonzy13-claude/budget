"use client";

/**
 * transaction-filter-chips.tsx — filter pills for date-range / category / account / scope / kind
 * (Plan 02-09 EXPN-09). Each pill toggles a popover with a picker; active pill renders with the
 * primary yellow accent border. Per UI-SPEC § Search/Filter.
 *
 * Stateless — parent owns filter values + URL round-trip.
 */
import { useTranslations } from "next-intl";

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  categoryIds?: string[];
  accountIds?: string[];
  scope?: "PERSONAL" | "SHARED";
  kind?: "EXPENSE" | "INCOME" | "TRANSFER";
}

export interface TransactionFilterChipsProps {
  filters: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
}

const ACTIVE_PILL =
  "border-[var(--primary)] text-[var(--primary)] bg-[var(--surface-elevated-dark)]";
const INACTIVE_PILL =
  "border-[var(--hairline-on-dark)] text-[var(--body)] hover:bg-[var(--surface-elevated-dark)]";

export function TransactionFilterChips({
  filters,
  onChange,
}: TransactionFilterChipsProps) {
  const t = useTranslations("budgeting.transactions.filters");

  const isActive = {
    dateRange: !!(filters.dateFrom || filters.dateTo),
    category: (filters.categoryIds?.length ?? 0) > 0,
    account: (filters.accountIds?.length ?? 0) > 0,
    scope: !!filters.scope,
    kind: !!filters.kind,
  };
  const anyActive =
    isActive.dateRange ||
    isActive.category ||
    isActive.account ||
    isActive.scope ||
    isActive.kind;

  function pillClass(active: boolean): string {
    return [
      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      active ? ACTIVE_PILL : INACTIVE_PILL,
    ].join(" ");
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="transaction-filter-chips"
      role="toolbar"
      aria-label={t("toolbarLabel")}
    >
      <button
        type="button"
        className={pillClass(isActive.dateRange)}
        data-testid="filter-pill-date-range"
        aria-pressed={isActive.dateRange}
        onClick={() => {
          if (isActive.dateRange) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { dateFrom: _f, dateTo: _ts, ...rest } = filters;
            onChange(rest);
          }
        }}
      >
        {t("dateRange")}
      </button>
      <button
        type="button"
        className={pillClass(isActive.category)}
        data-testid="filter-pill-category"
        aria-pressed={isActive.category}
        onClick={() => {
          if (isActive.category) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { categoryIds: _c, ...rest } = filters;
            onChange(rest);
          }
        }}
      >
        {t("category")}
      </button>
      <button
        type="button"
        className={pillClass(isActive.account)}
        data-testid="filter-pill-account"
        aria-pressed={isActive.account}
        onClick={() => {
          if (isActive.account) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { accountIds: _a, ...rest } = filters;
            onChange(rest);
          }
        }}
      >
        {t("account")}
      </button>
      <button
        type="button"
        className={pillClass(isActive.scope)}
        data-testid="filter-pill-scope"
        aria-pressed={isActive.scope}
        onClick={() => {
          if (isActive.scope) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { scope: _s, ...rest } = filters;
            onChange(rest);
          }
        }}
      >
        {t("scope")}
      </button>
      <button
        type="button"
        className={pillClass(isActive.kind)}
        data-testid="filter-pill-kind"
        aria-pressed={isActive.kind}
        onClick={() => {
          if (isActive.kind) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { kind: _k, ...rest } = filters;
            onChange(rest);
          }
        }}
      >
        {t("kind")}
      </button>
      {anyActive && (
        <button
          type="button"
          className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
          data-testid="filter-pill-clear-all"
          onClick={() => onChange({})}
        >
          {t("clearAll")}
        </button>
      )}
    </div>
  );
}
