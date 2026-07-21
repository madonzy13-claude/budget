"use client";
/**
 * possession-row.tsx — read-only possession row: per-item icon + name + value.
 *
 * A possession has no P/L, no quantity, no weight column — just what it's worth.
 * Row click opens the edit sheet; the hover trash archives it. Kept dnd-free and
 * unit-testable (no drag handle).
 */
import { useLocale, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";
import { possessionIconByName } from "@/lib/possession-icons";
import type { HoldingDto } from "@/hooks/use-investments";

interface PossessionRowProps {
  holding: HoldingDto;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PossessionRow({ holding, onEdit, onDelete }: PossessionRowProps) {
  const locale = useLocale();
  const t = useTranslations("budget.possessions");
  const Icon = possessionIconByName(holding.icon);
  const currency = holding.currentPriceCurrency ?? holding.buyCurrency ?? "";
  const value = centsToBare(holding.valueCents, locale);

  return (
    <div
      data-testid={`possession-row-${holding.name}`}
      role="button"
      tabIndex={0}
      aria-label={t("row.editAria", { name: holding.name })}
      onClick={() => onEdit?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit?.();
        }
      }}
      className="group flex min-h-[56px] w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 transition-colors hover:bg-[var(--surface-elevated-dark)] sm:min-h-[48px]"
    >
      <Icon
        className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-body-md text-[var(--body-on-dark)]">
        {holding.name}
      </span>
      <div className="flex shrink-0 items-baseline gap-1">
        <span className="text-num-sm text-[var(--muted-foreground)]">
          {currency}
        </span>
        <span className="text-num-md tabular-nums text-[var(--body-on-dark)]">
          {value}
        </span>
      </div>
      <button
        type="button"
        aria-label={t("row.deleteAria", { name: holding.name })}
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
        className="invisible flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--destructive)] group-hover:visible"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
