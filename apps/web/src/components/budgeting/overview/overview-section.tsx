"use client";
/**
 * overview-section.tsx — collapsible section shell for the Overview tab (11-09, DD-4).
 *
 * Full-width header button (title + chevron) + a body that renders ONLY when open
 * so each section's data hook stays disabled until first expand (lazy fetch, D-21).
 * Collapsed by default — the parent owns the open state.
 */
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function OverviewSection({
  title,
  open,
  onToggle,
  testId,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-[var(--radius-xl)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between px-2 py-3 text-title-sm text-[var(--body-on-dark)]"
      >
        <span>{title}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-5 text-[var(--muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div
          data-testid={testId ? `${testId}-body` : undefined}
          className="flex flex-col gap-6 border-t border-[var(--hairline-dark)] px-2 py-4"
        >
          {children}
        </div>
      )}
    </section>
  );
}
