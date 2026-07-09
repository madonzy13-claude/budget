"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      // !pointer-events-auto: a nested modal Radix Select/Popover sets an INLINE
      // `pointer-events: none` on this content while open (its DismissableLayer
      // inertizes outer layers), making the very trigger you clicked dead — the
      // close-tap then falls through to the Dialog overlay and reopens the Select.
      // Inline style beats a plain class, so force it with `!important` to keep the
      // sheet subtree interactive → the trigger closes natively, no reopen
      // (root-caused + validated live, r33 dropdown fix).
      className={cn(sheetVariants({ side }), "!pointer-events-auto", className)}
      data-sheet-content
      {...props}
    >
      {/* TOP safe-area inset for left/right full-height drawers in standalone.
          With viewport-fit=cover the sheet's top edge renders under the Dynamic
          Island / status bar. An in-flow spacer (not padding-top: that's
          stripped by callers who pass p-0) pushes SheetClose + children below
          the inset. Standalone-scoped so browser mode is unchanged.
          page-level .pb-shell-safe must never reach this portal (quick-260612-a0c R1). */}
      {(side === "left" || side === "right") && (
        <div
          aria-hidden
          data-sheet-safe-area-top
          className="pointer-events-none hidden h-[env(safe-area-inset-top,0px)] shrink-0 [@media(display-mode:standalone)]:block"
        />
      )}
      {/* Root cause #1 (quick-260612-e82): bare top-4 anchored X above the R2 top
          spacer and above the px-6 py-4 title row. New offset = env(safe-area-inset-top,0px)+22px:
          in browser env→0 so top:22px centers on the py-4/text-xl header (16px pad + ~14px half);
          in standalone it adds the same inset the top spacer applies, dropping X to the title level. */}
      <SheetClose className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+22px)] rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetClose>
      {children}
      {/* BOTTOM safe-area inset — Sheets portal to body and are ICB-anchored;
          page-level .pb-shell-safe must never reach them (quick-260612-a0c R1).
          The full-height left/right drawers absorb the iOS home-indicator inset
          INSIDE the sheet via this in-flow spacer. A real DOM spacer, not
          padding-bottom: iOS WebKit ignores end-of-scroll padding on scroll
          containers (device-verified SHELL-R8..R10), and a pb-* utility on the
          variant would be stripped by tailwind-merge wherever callers pass p-0
          (all three edit sliders do). Standalone-scoped so browser mode gets no
          extra flex-gap row. */}
      {(side === "left" || side === "right") && (
        <div
          aria-hidden
          data-sheet-safe-area
          className="pointer-events-none hidden h-[env(safe-area-inset-bottom,0px)] shrink-0 [@media(display-mode:standalone)]:block"
        />
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-xl font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
