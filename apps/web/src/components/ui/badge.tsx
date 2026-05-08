import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — compact label chip.
 *
 * Default reuses brand yellow + black to mirror DESIGN.md trust-badge usage
 * (small "No.1" call-outs). Secondary uses surface-elevated for muted chips
 * like "current session". Trading variants carry the same green/red price
 * semantics as the buttons — text-color only on transparent fill.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 px-2.5 py-0.5",
    "rounded-[var(--radius-sm)] text-xs font-semibold leading-tight",
    "transition-colors",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--on-primary)]",
        secondary: "bg-[var(--surface-elevated-dark)] text-[var(--on-dark)]",
        outline:
          "border border-[var(--border)] bg-transparent text-[var(--foreground)]",
        destructive: "bg-[var(--trading-down)] text-[var(--on-dark)]",
        tradingUp: "bg-transparent text-[var(--trading-up)]",
        tradingDown: "bg-transparent text-[var(--trading-down)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
