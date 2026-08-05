"use client";
/**
 * reserve-level-bar.tsx — held against needed, as a meter (260804).
 *
 * Two earlier attempts asked the reader to decode a shape. Stacked chunks never
 * said which was which; a "pipe" gave the outline one meaning, the fill another
 * and a hatched remainder a third — and hatching is a texture, which belongs to
 * accessibility fallbacks, not decoration.
 *
 * A ratio against a limit is a METER, and the target is drawn as a CONTAINER
 * (user's design, 260804): an outlined, taller box spanning what the history
 * asked for, holding a thinner bar for what is actually held. Over, the bar runs
 * out past the outline's end; short, the stretch it never reached is struck
 * through in a soft dashed red. The outline IS the target, so nothing has to
 * mark it separately, and the two quantities never compete for the same stretch
 * of pixels.
 *
 * Colour follows the PART, never the whole bar. Holding 28,934 against a target
 * of 8,313 is 248% off, and painting the entire fill by that one number turned
 * the bar solid red — including the 8,313 that is doing exactly its job (user
 * screenshot, 260804). Each stretch says what it is instead:
 *
 *   covered  (inside the outline)   grey    — the baseline; nothing to act on
 *   surplus  (past the outline)     amber   — idle; a slow loss, attention not alarm
 *   missing  (never reached)        dashed  — an absence, drawn as one
 *
 * The shortfall is dashed and soft on purpose: left as plain empty space it read
 * as nothing at all rather than as something missing (user, 260804), but a solid
 * red block would shout louder than the money that is really there.
 *
 * Nothing is hover-gated. Both figures and the action are on screen.
 */
import { useTranslations } from "next-intl";

const COVERED = "var(--muted-foreground)";
const SURPLUS = "var(--primary)";
const SHORT = "var(--trading-down)";
/** Breathing room between the outline and the bar it contains, in px: the box is
 *  16 tall with a 1px border around a 6px bar, so 4px of clearance above and
 *  below — 5 from the outer edge, matched here at the sides. */
const INNER_PAD = 5;

/** Coarse 45° dashes — dense hatching shimmers, and this is background. */
const MISSING = `repeating-linear-gradient(45deg, ${SHORT} 0 2px, transparent 2px 7px)`;

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
  const covered = Math.min(held, needed);
  const surplus = Math.max(0, slack);
  const missing = Math.max(0, -slack);
  // Padding only works while the bar is INSIDE the box. Once it runs past, the
  // inset shifts the covered stretch off the outline's right edge and the colour
  // spills over the border (user screenshot, 260804).
  const pad = surplus > 0 ? 0 : INNER_PAD;
  const width = (v: number) => `${(100 * v) / scale}%`;

  const action = slack > 0 ? "canWithdraw" : slack < 0 ? "topUp" : "inBalance";
  // The action inherits the colour of the stretch it is about, so the sentence
  // and the shape never disagree.
  const actionTone = slack > 0 ? SURPLUS : slack < 0 ? SHORT : undefined;

  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1.5"
      style={{ marginLeft: insetLeft, marginRight: insetRight }}
    >
      {/* Both sides of the comparison, named — the meter shows the ratio, these
          say what it is a ratio OF. */}
      <div
        data-testid={`${testId}-labels`}
        className="flex items-baseline justify-between gap-3 text-caption"
      >
        <span
          data-testid={`${testId}-needed`}
          className="text-[var(--muted-foreground)]"
        >
          {t("reserveFit.neededTotal")}{" "}
          <span className="num text-[var(--body-on-dark)]">
            {format(needed)}
          </span>
        </span>
        <span
          data-testid={`${testId}-held`}
          className="text-[var(--muted-foreground)]"
        >
          {t("reserveFit.heldTotal")}{" "}
          <span className="num text-[var(--body-on-dark)]">{format(held)}</span>
        </span>
      </div>

      <div className="relative h-4 w-full">
        {/* The target, as a box you can see the held bar sit inside — or spill
            out of. Transparent, so the bar inside is never fighting a fill. */}
        {needed > 0 && (
          <div
            data-testid={`${testId}-target`}
            aria-label={`${t("reserveFit.neededTotal")}: ${format(needed)}`}
            className="absolute inset-y-0 left-0 rounded-full border border-[var(--muted-foreground)]"
            style={{ width: width(needed) }}
          />
        )}
        {/* What is actually held — thinner, centred, and free to run past the
            outline's right edge when there is more than the target asked for. */}
        {/* Inset so the bar sits INSIDE the outline rather than welding itself
            to the border — touching edges read as one shape. */}
        <div
          data-testid={`${testId}-inner`}
          className="absolute top-1/2 flex h-1.5 -translate-y-1/2"
          style={{ left: pad, right: pad }}
        >
          {covered > 0 && (
            <div
              data-testid={`${testId}-covered`}
              aria-label={`${t("reserveFit.heldTotal")}: ${format(held)}`}
              className="h-full rounded-l-full"
              style={{
                width: width(covered),
                background: COVERED,
                borderTopRightRadius: surplus > 0 ? 0 : 9999,
                borderBottomRightRadius: surplus > 0 ? 0 : 9999,
              }}
            />
          )}
          {missing > 0 && (
            <div
              data-testid={`${testId}-gap`}
              aria-label={`${t("reserveFit.topUp")}: ${format(missing)}`}
              className="ml-auto h-full rounded-r-full"
              style={{
                width: width(missing),
                background: MISSING,
                opacity: 0.55,
              }}
            />
          )}
          {surplus > 0 && (
            <div
              data-testid={`${testId}-surplus`}
              aria-label={`${t("reserveFit.canWithdraw")}: ${format(surplus)}`}
              className="h-full rounded-r-full"
              style={{
                width: width(surplus),
                background: SURPLUS,
                borderTopLeftRadius: covered > 0 ? 0 : 9999,
                borderBottomLeftRadius: covered > 0 ? 0 : 9999,
              }}
            />
          )}
        </div>
      </div>

      {/* The conclusion, which is the only thing here to act on. */}
      <p
        data-testid={`${testId}-action`}
        className="text-caption text-center"
        style={{ color: actionTone }}
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
