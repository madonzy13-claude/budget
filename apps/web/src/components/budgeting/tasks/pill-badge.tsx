/**
 * PillBadge — small red numeric badge for BDP pills and home BudgetCard.
 *
 * Renders null when count <= 0 (no zero-badges anywhere — Tasks-Redesign D8).
 * Background: --trading-down (#f6465d). Foreground: white.
 *
 * Parent provides positioning (e.g. absolute top-right on BudgetCard,
 * inline next to label inside BdpTabs NavLink).
 */
interface PillBadgeProps {
  count: number;
  ariaLabel?: string;
}

export function PillBadge({ count, ariaLabel }: PillBadgeProps) {
  if (count == null || count <= 0) return null;
  return (
    <span
      data-testid="pill-badge"
      aria-label={ariaLabel}
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--trading-down)] px-1.5 text-[10px] font-bold leading-none text-white"
    >
      {count}
    </span>
  );
}
