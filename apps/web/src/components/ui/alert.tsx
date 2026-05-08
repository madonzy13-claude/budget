import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Alert — full-bordered notice card. No side stripes (DESIGN.md absolute ban).
 *
 * Variants:
 *   default      — neutral surface notice (verify-pending banners, soft hints)
 *   destructive  — trading-down red, used only for blocking errors
 *   warning      — brand yellow tint, used for verify-email / action-required
 */
const alertVariants = cva(
  [
    "relative w-full rounded-[var(--radius-lg)] border p-4 text-sm",
    "[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4",
    "[&>svg~*]:pl-7 [&>svg+div]:translate-y-[-2px]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]",
          "[&>svg]:text-[var(--card-foreground)]",
        ].join(" "),
        destructive: [
          "border-[color-mix(in_oklab,var(--trading-down)_50%,transparent)]",
          "bg-[color-mix(in_oklab,var(--trading-down)_12%,var(--card))]",
          "text-[var(--trading-down)] [&>svg]:text-[var(--trading-down)]",
        ].join(" "),
        warning: [
          "border-[color-mix(in_oklab,var(--primary)_45%,transparent)]",
          "bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]",
          "text-[var(--primary)] [&>svg]:text-[var(--primary)]",
        ].join(" "),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 text-title-sm leading-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm leading-relaxed [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
