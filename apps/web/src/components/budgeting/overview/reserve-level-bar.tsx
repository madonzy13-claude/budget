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
 *   covered  (inside the outline)   green, solid    — money doing its job
 *   surplus  (past the outline)     amber, dashed   — idle; a slow loss
 *   missing  (never reached)        red, dashed     — an absence, drawn as one
 *
 * Only the covered stretch is solid, and only it is green. Both of the others
 * are money that is NOT working — one not there, one doing nothing — and the
 * dashes carry that on their own, at full strength: faded against a dark canvas
 * the three colours drifted toward the background and toward each other (user,
 * 260805). Green at any level, not only once the target is met: what is missing
 * is already stated in red beside it, and greying the held stretch until then
 * left a nearly-full reserve looking as inert as an empty one.
 *
 * Nothing is hover-gated. Both figures and the action are on screen.
 */
import { useTranslations } from "next-intl";

/** The target is what "right" looks like, so it wears the on-plan green: the
 *  outline, the word that names it, and the money held inside it — at any level
 *  (user, 260805). Held money is doing its job whether or not there is enough of
 *  it yet, and what is MISSING is already said, in red, right beside it; greying
 *  the held stretch until the target was met left a nearly-full reserve looking
 *  as inert as an empty one. */
const TARGET = "var(--trading-up)";
const SURPLUS = "var(--primary)";
const SHORT = "var(--trading-down)";
/** Breathing room between the outline and the bar it contains, in px: the box is
 *  16 tall with a 1px border around a 6px bar, so 4px of clearance above and
 *  below — 5 from the outer edge, matched here at the sides. */
const INNER_PAD = 5;

/** Coarse 45° dashes — dense hatching shimmers, and this is background.
 *
 *  Both ends of the bar wear them (user, 260805): one stretch is money that is
 *  not there and one is money doing nothing, and neither should read as solidly
 *  as the stretch that is actually covering the reserve. Only that middle
 *  stretch stays a solid fill. */
const dashed = (color: string) =>
  `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 7px)`;
const MISSING = dashed(SHORT);
const IDLE = dashed(SURPLUS);

export function ReserveLevelBar({
  heldCents,
  neededCents,
  format,
  testId,
  // The money forecast is a card with 16px of padding and a section body has 8,
  // so 8px more each side puts this on exactly the forecast band's width.
  insetLeft = 8,
  insetRight = 8,
  heldLabel,
  neededLabel,
}: {
  heldCents: number;
  neededCents: number;
  format: (n: number) => string;
  testId: string;
  insetLeft?: number;
  insetRight?: number;
  /** What the two sides are CALLED. The meter is a ratio of one quantity to
   *  the one it should be, which is as true of limits as of reserves — so the
   *  Future chart borrows the shape and renames the halves (260809). */
  heldLabel?: string;
  neededLabel?: string;
}) {
  const t = useTranslations("bdp.tab.overview");
  const heldName = heldLabel ?? t("reserveFit.heldTotal");
  const neededName = neededLabel ?? t("reserveFit.neededTotal");

  const held = Math.max(0, heldCents);
  const needed = Math.max(0, neededCents);
  const scale = Math.max(held, needed);
  if (scale <= 0) return null;

  // A few groszy is not a surplus and not a shortfall. Every other figure on
  // the Overview treats a sub-unit difference as no difference — the bars, the
  // totals, the rebalance buttons — and the SHAPE has to agree, or a meter
  // reading "exactly what is needed" can still draw an end cut off square
  // (user, 260810).
  const UNIT = 100;
  const raw = held - needed;
  const slack = Math.abs(raw) < UNIT ? 0 : raw;
  const covered = Math.min(held, needed);
  const surplus = Math.max(0, slack);
  const missing = Math.max(0, -slack);
  const width = (v: number) => `${(100 * v) / scale}%`;
  // Every stretch is a percentage of the WHOLE track, and the bar's left inset
  // is then subtracted in pixels. Measuring them against the inset row instead
  // shrank each one by that inset's share, which walked every boundary left —
  // and the idle dashes began INSIDE the outline they mark the end of (user
  // screenshot, 260805).
  //
  // Each stretch then gives back, in pixels, the insets its own ends sit behind:
  // the covered one for the outline's left edge, and again for its right edge
  // when it is the last thing inside the box. The bar therefore clears the
  // outline at BOTH ends whether it is short of the target or past it (user,
  // 260805) — and the idle stretch, which belongs outside the box entirely,
  // starts ON the border rather than a padding's width before it.
  const stretch = (v: number, giveBack: number) =>
    giveBack > 0 ? `calc(${width(v)} - ${giveBack}px)` : width(v);

  // Informative, not an instruction (user, 260805): the meter reports where the
  // buffer stands against what the history asked for, and leaves what to do
  // about it to the household.
  const action =
    slack > 0 ? "aboveTarget" : slack < 0 ? "belowTarget" : "onTarget";
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
        <span data-testid={`${testId}-needed`} style={{ color: TARGET }}>
          {neededName}{" "}
          <span className="num font-semibold">{format(needed)}</span>
        </span>
        <span
          data-testid={`${testId}-held`}
          className="text-[var(--muted-foreground)]"
        >
          {heldName}{" "}
          <span className="num text-[var(--body-on-dark)]">{format(held)}</span>
        </span>
      </div>

      <div className="relative h-4 w-full">
        {/* The target, as a box you can see the held bar sit inside — or spill
            out of. Transparent, so the bar inside is never fighting a fill. */}
        {needed > 0 && (
          <div
            data-testid={`${testId}-target`}
            aria-label={`${neededName}: ${format(needed)}`}
            className="absolute inset-y-0 left-0 rounded-full border"
            style={{ width: width(needed), borderColor: TARGET }}
          />
        )}
        {/* What is actually held — thinner, centred, and free to run past the
            outline's right edge when there is more than the target asked for. */}
        {/* Inset so the bar sits INSIDE the outline rather than welding itself
            to the border — touching edges read as one shape. */}
        <div
          data-testid={`${testId}-inner`}
          className="absolute top-1/2 flex h-1.5 -translate-y-1/2"
          // The full track: the stretches inside are percentages OF it.
          style={{ left: 0, right: 0 }}
        >
          {covered > 0 && (
            <div
              data-testid={`${testId}-covered`}
              // Which shape this is, in the DOM: a screenshot cannot tell a
              // pill with a 3px cap from a square end, and two rounds went on
              // arguing about it (user, 260809-260810). "whole" is the only
              // state that rounds on the right.
              data-fit={
                missing === 0 && surplus === 0
                  ? "whole"
                  : missing > 0
                    ? "short"
                    : "over"
              }
              aria-label={`${heldName}: ${format(held)}`}
              // Nothing follows it inside the box and nothing spills past it:
              // the bar IS the whole track, so it is a pill. A flat right end
              // against the outline's curve reads as a bar cut off (user,
              // 260810).
              className={
                missing === 0 && surplus === 0
                  ? "h-full rounded-full"
                  : "h-full rounded-l-full"
              }
              style={{
                marginLeft: INNER_PAD,
                // Twice over when nothing follows it inside the box: it is
                // then behind the outline's right edge as well as its left.
                width: stretch(covered, INNER_PAD * (missing === 0 ? 2 : 1)),
                background: TARGET,
                // NO radius here. The class owns all four corners, because CSS
                // scales every radius by ONE factor when they overflow the box
                // — and this element is 6px tall, so they always do:
                //
                //   f = min(side ÷ Σ radii on that side)
                //
                // With rounded-full on the left (16,777,200px) and an inline
                // 9999px on the right, f came from the left pair: 6/33,554,400
                // = 1.79e-7. The left corners landed on 3px, a proper cap; the
                // right on 0.002px, square. Both values read as plainly
                // non-zero in the DOM, which is why this survived three passes
                // (user devtools, 260810).
              }}
            />
          )}
          {missing > 0 && (
            <div
              data-testid={`${testId}-gap`}
              aria-label={`${format(missing)} ${t("reserveFit.belowTarget")}`}
              className="ml-auto h-full rounded-r-full"
              style={{
                // HELD off the outline's right edge, not merely trimmed. This
                // stretch is pinned right by ml-auto, so giving width back
                // moved its left edge and left the dashes sitting on the
                // border they stop inside (user screenshot, 260809). The
                // covered stretch has already given back the left inset, so
                // the two still meet exactly where they should.
                marginRight: INNER_PAD,
                width: stretch(missing, INNER_PAD),
                background: MISSING,
              }}
            />
          )}
          {surplus > 0 && (
            <div
              data-testid={`${testId}-surplus`}
              aria-label={`${format(surplus)} ${t("reserveFit.aboveTarget")}`}
              className="h-full rounded-r-full"
              style={{
                // Clear of the outline's right edge, which the covered stretch
                // now stops behind — so this begins exactly ON the border and
                // never inside it (user screenshot, 260805).
                marginLeft: INNER_PAD,
                width: width(surplus),
                background: IDLE,
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
        {/* Amount first, so the line reads as a statement rather than a label
            with a figure stuck on the end. */}
        {slack !== 0 && (
          <span className="num mr-1 font-semibold">
            {format(Math.abs(slack))}
          </span>
        )}
        {t(`reserveFit.${action}`)}
      </p>
    </div>
  );
}
