"use client";
/**
 * investment-group-header.tsx — Collapsible group header (Phase 9, D-24).
 *
 * Registers as a dnd-kit droppable with id "group-<name>" (Pitfall 7 — dropping
 * a holding here reassigns its group). Collapsed/expanded persisted by the parent
 * section (localStorage key inv-group-{budgetId}-{slug}, default expanded). The
 * full header row is the collapse tap target (44×44 effective on mobile).
 */
import { useDroppable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";

interface InvestmentGroupHeaderProps {
  groupName: string;
  /** group value / total investments value × 100, 1 decimal. */
  groupPct: number;
  expanded: boolean;
  onToggle: () => void;
}

export function InvestmentGroupHeader({
  groupName,
  groupPct,
  expanded,
  onToggle,
}: InvestmentGroupHeaderProps) {
  const t = useTranslations("budget.investments");
  const { setNodeRef, isOver } = useDroppable({ id: `group-${groupName}` });
  const pct = `${groupPct.toFixed(1)}%`;

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={t("group.headerAria", {
        name: groupName,
        pct,
        state: expanded ? t("group.expanded") : t("group.collapsed"),
      })}
      data-testid={`investment-group-${groupName}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={[
        "flex min-h-[40px] items-center gap-2 rounded-[var(--radius-md)] px-2",
        "bg-[var(--surface-card-dark)]",
        isOver
          ? "ring-2 ring-dashed ring-[var(--info-ring)] bg-[var(--surface-elevated-dark)]/60"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {expanded ? (
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
          aria-hidden="true"
        />
      ) : (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-title-sm text-[var(--body-on-dark)]">
        {groupName}
      </span>
      <span className="shrink-0 text-num-sm text-[var(--muted-foreground)] tabular-nums">
        {pct} {t("group.portfolioSuffix")}
      </span>
    </div>
  );
}
