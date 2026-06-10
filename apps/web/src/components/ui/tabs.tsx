"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Tabs — Binance segmented bar.
 *
 * Two variants:
 *  - underline (default): flat row of triggers, active marked by a 2px brand-yellow
 *    bottom border. Used by /settings (legacy consumer — DO NOT REGRESS).
 *  - pill: yellow-on-black active pill (DESIGN.md trader-row CTA shape). Used by
 *    BDP frame (Plan 03-06). The pill background uses --primary + --on-primary text
 *    per D-PH3-02.
 *
 * Defaults preserve underline behavior so existing callers pass no `variant`.
 */
const tabsListVariants = cva("inline-flex items-center justify-start", {
  variants: {
    variant: {
      underline: "gap-1 border-b border-[var(--border)]",
      pill: "h-12 gap-2",
    },
  },
  defaultVariants: { variant: "underline" },
});

const tabsTriggerVariants = cva(
  [
    "inline-flex cursor-pointer items-center whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
    "disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        underline: [
          "relative px-4 py-3 text-sm font-semibold leading-none",
          "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          "data-[state=active]:text-[var(--foreground)]",
          "data-[state=active]:after:absolute data-[state=active]:after:left-0",
          "data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px",
          "data-[state=active]:after:h-[2px] data-[state=active]:after:bg-[var(--primary)]",
        ].join(" "),
        pill: [
          "h-9 px-4 gap-2 rounded-[var(--radius-pill)] text-sm",
          "text-[var(--muted-foreground)]",
          "hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--on-dark)]",
          "data-[state=active]:bg-[var(--primary)] data-[state=active]:text-[var(--on-primary)]",
          "data-[state=active]:font-semibold",
        ].join(" "),
      },
    },
    defaultVariants: { variant: "underline" },
  },
);

const Tabs = TabsPrimitive.Root;

export type TabsListProps = React.ComponentPropsWithoutRef<
  typeof TabsPrimitive.List
> &
  VariantProps<typeof tabsListVariants>;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export type TabsTriggerProps = React.ComponentPropsWithoutRef<
  typeof TabsPrimitive.Trigger
> &
  VariantProps<typeof tabsTriggerVariants>;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabsTriggerVariants({ variant }), className)}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-6 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
  tabsTriggerVariants,
};
