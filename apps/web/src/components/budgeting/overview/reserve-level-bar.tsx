"use client";
/**
 * reserve-level-bar.tsx — held against needed, as a meter (260804).
 *
 * Two earlier attempts asked the reader to decode a shape. Stacked chunks never
 * said which was which; a "pipe" gave the outline one meaning, the fill another
 * and a hatched remainder a third — and hatching is a texture, which belongs to
 * accessibility fallbacks, not decoration.
 *
 * A ratio against a limit is a METER, so this is one: a single bar for what is
 * HELD, and a target mark for what the history asked for. One quantity, one
 * encoding. Past the mark the money is idle; short of it the buffer is exposed,
 * and the stretch between the two is the amount to move — which the line
 * underneath states outright.
 *
 * The fill bands by DISTANCE from the target, exactly as the bars below it do,
 * because both directions are a problem: too little is overspend risk, too much
 * is money the engine will never hand back.
 *
 * Nothing is hover-gated. Both figures and the action are on screen; the hover
 * only repeats them.
 */
import { useTranslations } from "next-intl";
import { varianceColor } from "@/components/budgeting/charts/diverging-bar-chart";

export function ReserveLevelBar({
  heldCents,
  neededCents,
  format,
  testId,
  // The money forecast is a card with 16px of padding and a section body has 8,
  // so 8px more each side puts this on exactly the forecast band's width.
  insetLeft = 8,
  insetRight = 8,
}: {
  heldCents: number;
  neededCents: number;
  format: (n: number) => string;
  testId: string;
  insetLeft?: number;
  insetRight?: number;
}) {
  const t = useTranslations("bdp.tab.overview");

  const held = Math.max(0, heldCents);
  const needed = Math.max(0, neededCents);
  const scale = Math.max(held, needed);
  if (scale <= 0) return null;

  const slack = held - needed;
  // No requirement at all: every zloty of it is spare, which reads as "far off"
  // rather than as a division by zero.
  const pct = needed > 0 ? (100 * slack) / needed : held > 0 ? 100 : 0;
  const tone = varianceColor(pct);

  const action = slack > 0 ? "canWithdraw" : slack < 0 ? "topUp" : "inBalance";

  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1.5"
      style={{ marginLeft: insetLeft, marginRight: insetRight }}
    >
      {/* Both sides of the comparison, named — the meter shows the ratio, these
          say what it is a ratio OF. */}
      <div className="flex items-baseline justify-between gap-3 text-caption">
        <span
          data-testid={`${testId}-held`}
          className="text-[var(--muted-foreground)]"
        >
          {t("reserveFit.heldTotal")}{" "}
          <span className="num text-[var(--body-on-dark)]">{format(held)}</span>
        </span>
        <span
          data-testid={`${testId}-needed`}
          className="text-[var(--muted-foreground)]"
        >
          {t("reserveFit.neededTotal")}{" "}
          <span className="num text-[var(--body-on-dark)]">
            {format(needed)}
          </span>
        </span>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full bg-[var(--surface-elevated-dark)]">
        <div
          data-testid={`${testId}-fill`}
          className="h-full rounded-full transition-[width]"
          style={{ width: `${(100 * held) / scale}%`, background: tone }}
          aria-label={`${t("reserveFit.heldTotal")}: ${format(held)}`}
        />
        {needed > 0 && (
          <span
            data-testid={`${testId}-mark`}
            aria-label={`${t("reserveFit.neededTotal")}: ${format(needed)}`}
            // The target: a full-height notch in the surface colour, so it reads
            // as a division of the bar rather than as another quantity in it.
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--body-on-dark)]"
            style={{ left: `${(100 * needed) / scale}%` }}
          />
        )}
      </div>

      {/* The conclusion, which is the only thing here to act on. */}
      <p
        data-testid={`${testId}-action`}
        className="text-caption text-center"
        style={{ color: slack === 0 ? undefined : tone }}
      >
        {t(`reserveFit.${action}`)}
        {slack !== 0 && (
          <span className="num ml-1 font-semibold">
            {format(Math.abs(slack))}
          </span>
        )}
      </p>
    </div>
  );
}
