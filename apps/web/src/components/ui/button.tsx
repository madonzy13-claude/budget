import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — Binance-style button system (DESIGN.md §Buttons).
 *
 * Primary: brand yellow (#fcd535) with on-primary black text. The single CTA
 * shape that appears on both dark and light surfaces unchanged.
 *
 * Trading variants (up / down) carry semantic price-direction meaning — only
 * use for explicit Buy/Sell or Long/Short actions, never for generic confirm
 * or cancel.
 *
 * Pill variant is reserved for "this is THE action" moments (top-of-page
 * sign-up, product-launch hero CTAs). Don't use it everywhere or it stops
 * meaning anything.
 */
const buttonVariants = cva(
  [
    "inline-flex cursor-pointer select-none items-center justify-center gap-2",
    "whitespace-nowrap font-semibold leading-none transition-colors",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-[var(--primary)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--primary)] text-[var(--on-primary)]",
          "hover:bg-[var(--primary-active)]",
          "active:bg-[var(--primary-active)]",
          "disabled:bg-[var(--primary-disabled)] disabled:text-[var(--muted-foreground)] disabled:opacity-100",
          "rounded-[var(--radius-md)]",
        ].join(" "),
        secondary: [
          "bg-[var(--surface-elevated-dark)] text-[var(--on-dark)]",
          "hover:bg-[color-mix(in_oklab,var(--surface-elevated-dark)_70%,white_5%)]",
          "rounded-[var(--radius-md)]",
        ].join(" "),
        outline: [
          "border border-[var(--border)] bg-transparent text-[var(--foreground)]",
          "hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--on-dark)]",
          "rounded-[var(--radius-md)]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[var(--foreground)]",
          "hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--on-dark)]",
          "rounded-[var(--radius-md)]",
        ].join(" "),
        link: [
          "bg-transparent p-0 h-auto text-[var(--primary)]",
          "underline-offset-4 hover:underline",
          "rounded-none",
        ].join(" "),
        destructive: [
          "bg-[var(--trading-down)] text-[var(--on-dark)]",
          "hover:bg-[color-mix(in_oklab,var(--trading-down)_85%,black)]",
          "rounded-[var(--radius-md)]",
        ].join(" "),
        tradingUp: [
          "bg-[var(--trading-up)] text-[var(--on-dark)]",
          "hover:bg-[color-mix(in_oklab,var(--trading-up)_85%,black)]",
          "rounded-[var(--radius-sm)]",
        ].join(" "),
        tradingDown: [
          "bg-[var(--trading-down)] text-[var(--on-dark)]",
          "hover:bg-[color-mix(in_oklab,var(--trading-down)_85%,black)]",
          "rounded-[var(--radius-sm)]",
        ].join(" "),
        // Compact yellow CTA used inside dense table rows (subscribe / take action)
        subscribe: [
          "bg-[var(--primary)] text-[var(--on-primary)]",
          "hover:bg-[var(--primary-active)]",
          "rounded-[var(--radius-sm)]",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 text-[13px] has-[>svg]:px-2.5",
        md: "h-10 px-6 text-sm has-[>svg]:px-5",
        lg: "h-12 px-8 text-base has-[>svg]:px-6",
        icon: "size-10",
        // Pill variant geometry — slightly larger touch target, full radius
        pill: "h-12 px-8 text-sm rounded-[var(--radius-pill)]",
        // Subscribe-row geometry — DESIGN.md trader-row size
        subscribe: "h-7 px-4 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
