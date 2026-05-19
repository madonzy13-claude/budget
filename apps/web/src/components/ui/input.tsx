import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input — flat hairline-bordered field.
 *
 * surface-card-dark fill with hairline-dark border, blue focus ring, red
 * aria-invalid border. Tokens live in global.css; this component reads
 * them via CSS variables only.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base on mobile (16px) prevents iOS Safari from zooming the
          // viewport when the input is focused; desktop drops back to text-sm.
          "flex h-10 w-full min-w-0 px-3 py-2 text-base sm:text-sm",
          "rounded-[var(--radius-md)] border border-[var(--input)]",
          "bg-[color-mix(in_oklab,var(--card)_92%,transparent)]",
          "text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
          "transition-colors",
          // UAT-PH5-T3-38: yellow border on focus, NO shadow/ring.
          // appearance-none + outline-none + tap-highlight kill the
          // iOS browser-default focus indicator that was showing as a
          // blue outline around the cell.
          "appearance-none [-webkit-tap-highlight-color:transparent]",
          "focus-visible:border-[var(--primary)] focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-[var(--trading-down)]",
          "aria-invalid:ring-2 aria-invalid:ring-[color-mix(in_oklab,var(--trading-down)_30%,transparent)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
