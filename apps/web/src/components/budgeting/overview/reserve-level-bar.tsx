"use client";
/**
 * reserve-level-bar.tsx — held against needed, as layers (260804).
 *
 * The stacked version read as three unrelated chunks. This is a PIPE: its
 * outline is what the category history asked for, and the fill inside it is
 * what is actually held. Under-filled, the empty stretch is what has to go in;
 * filled past the end, the overflow is what can come out. One shape, and which
 * way to move the money is obvious before any number is read.
 *
 * Hovering (or tapping, or tabbing to) a layer floats the same tooltip the money
 * forecast uses — type and amount, no scrubber line.
 */
import * as React from "react";
import { useTranslations } from "next-intl";

export function ReserveLevelBar({
  heldCents,
  neededCents,
  format,
  testId,
  insetLeft = 0,
  insetRight = 0,
}: {
  heldCents: number;
  neededCents: number;
  format: (n: number) => string;
  testId: string;
  /** Match the chart below: its axis width and right margin, in px. */
  insetLeft?: number;
  insetRight?: number;
}) {
  const t = useTranslations("bdp.tab.overview");
  const [active, setActive] = React.useState<{
    label: string;
    value: number;
    color: string;
    leftPct: number;
  } | null>(null);

  const held = Math.max(0, heldCents);
  const needed = Math.max(0, neededCents);
  const scale = Math.max(held, needed);
  if (scale <= 0) return null;

  const pct = (v: number) => (100 * v) / scale;
  const filled = Math.min(held, needed);
  const gap = Math.max(0, needed - held);
  const overflow = Math.max(0, held - needed);

  const layer = (
    key: string,
    label: string,
    value: number,
    color: string,
    leftPct: number,
  ) => ({
    onPointerEnter: () => setActive({ label, value, color, leftPct }),
    onPointerLeave: () => setActive(null),
    onFocus: () => setActive({ label, value, color, leftPct }),
    onBlur: () => setActive(null),
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `${label}: ${format(value)}`,
    "data-testid": `${testId}-${key}`,
  });

  return (
    <div
      data-testid={testId}
      className="relative"
      style={{ marginLeft: insetLeft, marginRight: insetRight }}
    >
      <div className="relative flex h-4 w-full items-stretch">
        {/* The pipe: what the history asked for. Its border is the requirement,
            and everything inside it is money that is actually there. */}
        {needed > 0 && (
          <div
            {...layer(
              "pipe",
              t("reserveFit.neededTotal"),
              needed,
              "var(--chart-bar-1)",
              pct(needed) / 2,
            )}
            className="relative h-full cursor-pointer overflow-hidden rounded-l-full border border-[var(--chart-bar-1)] bg-[var(--surface-elevated-dark)]"
            style={{
              width: `${pct(needed)}%`,
              borderRightWidth: overflow > 0 ? 0 : 1,
              borderTopRightRadius: overflow > 0 ? 0 : 9999,
              borderBottomRightRadius: overflow > 0 ? 0 : 9999,
            }}
          >
            <div
              {...layer(
                "fill",
                t("reserveFit.heldTotal"),
                held,
                "var(--chart-bar-1)",
                pct(filled) / 2,
              )}
              className="h-full cursor-pointer bg-[var(--chart-bar-1)]"
              style={{ width: `${needed > 0 ? (100 * filled) / needed : 0}%` }}
            />
            {gap > 0 && (
              <div
                {...layer(
                  "gap",
                  t("reserveFit.topUp"),
                  gap,
                  "var(--trading-down)",
                  pct(held + gap / 2),
                )}
                aria-hidden={false}
                className="absolute inset-y-0 right-0 cursor-pointer"
                style={{
                  width: `${needed > 0 ? (100 * gap) / needed : 0}%`,
                  background:
                    "repeating-linear-gradient(45deg, var(--trading-down) 0 2px, transparent 2px 6px)",
                  opacity: 0.5,
                }}
              />
            )}
          </div>
        )}

        {/* Past the pipe: money the history never asked for. */}
        {overflow > 0 && (
          <div
            {...layer(
              "overflow",
              t("reserveFit.canWithdraw"),
              overflow,
              "var(--muted-foreground)",
              pct(needed + overflow / 2),
            )}
            className="h-full cursor-pointer rounded-r-full bg-[var(--muted-foreground)]"
            style={{ width: `${pct(overflow)}%`, opacity: 0.55 }}
          />
        )}
      </div>

      {active && (
        <div
          data-testid={`${testId}-tooltip`}
          // Above the bar so a finger never covers it, edge-anchored so it can
          // never clip out of the card — same rules as the forecast tooltip.
          style={{
            left: `${active.leftPct}%`,
            transform: `translateX(${active.leftPct < 22 ? 0 : active.leftPct > 78 ? -100 : -50}%)`,
          }}
          className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-3 py-2 text-xs shadow-lg"
        >
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: active.color }}
            />
            <span className="text-[var(--muted-foreground)]">
              {active.label}
            </span>
            <span className="num font-semibold text-[var(--body-on-dark)]">
              {format(active.value)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
