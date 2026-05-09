"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Tabs — Binance segmented bar.
 *
 * The list is a flat row of triggers; the active trigger is signaled by a
 * 2px brand-yellow underline + on-dark text. No pill-shaped active backgrounds,
 * no shadows. Inactive triggers sit on muted text and lift to body color on hover.
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 border-b border-[var(--border)]",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex cursor-pointer items-center whitespace-nowrap px-4 py-3",
      "text-sm font-semibold leading-none transition-colors",
      "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
      "data-[state=active]:text-[var(--foreground)]",
      "data-[state=active]:after:absolute data-[state=active]:after:left-0",
      "data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px",
      "data-[state=active]:after:h-[2px] data-[state=active]:after:bg-[var(--primary)]",
      "focus-visible:outline-2 focus-visible:outline-offset-2",
      "focus-visible:outline-[var(--info)]",
      "disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
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

export { Tabs, TabsList, TabsTrigger, TabsContent };
