"use client";
/**
 * segmented-toggle.tsx — two (or a few) options in one pill track (260802).
 *
 * The look the app already uses for "Incl. contributions / Excl. contributions":
 * a sunken rounded track, the chosen option raised out of it. Both choices stay
 * readable, so the state is the raised pill rather than something to infer from
 * a switch's direction.
 */
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Spelled-out name when the visible label is abbreviated. */
  title?: string;
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  testId,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Group name for screen readers. */
  label?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-sunken-dark)] p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.title ?? o.label}
            onClick={() => {
              if (!active) onChange(o.value);
            }}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 transition-colors",
              active
                ? "bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
