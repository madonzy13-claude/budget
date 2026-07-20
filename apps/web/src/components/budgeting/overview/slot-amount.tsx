"use client";
/**
 * slot-amount.tsx — privacy amounts that hide behind slightly-blurred random
 * UPPERCASE chars and reveal on tap with a "slot-machine" scramble (r41).
 *
 * SHARED reveal (r41b): all SlotAmounts under a <SlotRevealProvider> toggle
 * TOGETHER — tapping any one reveals/hides them all. Outside a provider each one
 * keeps its own local state (isolated component tests). The scramble and a small
 * blur (blur↔sharp) run simultaneously in both directions for a fluent effect.
 *
 * Only the digits scramble — the currency symbol/code, separators and sign stay
 * verbatim ("do not make currency random"); random chars are A–Z uppercase.
 *
 * SECURITY: real digits are NEVER in the DOM while hidden — the resting state is
 * a frozen random-uppercase mask; the real string lives only in props / JS.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

const TICK_MS = 42;
const TICKS = 12; // ~0.5s total scramble
const BLUR_MS = 500; // matches the scramble so blur + shuffle finish together

// Mask the digits, separators (comma/dot) and sign (+/−) — enough to hide the
// magnitude. The CURRENCY symbol/code (and spaces) stay verbatim so the amount
// still reads as "money in zł/$"; only the number itself is hidden.
const isDigit = (c: string) => c >= "0" && c <= "9";
const isBlurable = (c: string) =>
  isDigit(c) || c === "," || c === "." || c === "+" || c === "-" || c === "−";
// Width-matched masks (NO fixed-width box — that padded the commas out and looked
// ugly). The narrow glyphs comma, dot and the digit "1" are replaced by a narrow
// "I"; every other char (digits 0/2–9, sign, currency) by a MEDIUM-width uppercase
// letter from a curated set (no too-wide M/W, no too-narrow I/J so widths stay
// close to a real digit). Kept uppercase so no lowercase/real digits leak.
const NARROW = ",.1";
const MASK_ALPHABET = "ERTYUPASDFHJKLZXVN";
const maskChar = (original?: string) =>
  original && NARROW.includes(original)
    ? "I"
    : MASK_ALPHABET[Math.floor(Math.random() * MASK_ALPHABET.length)]!;

interface SlotRevealState {
  revealed: boolean;
  toggle: () => void;
}
const SlotRevealCtx = createContext<SlotRevealState | null>(null);

/** Shared reveal state — every SlotAmount inside toggles together (r41b). */
export function SlotRevealProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const toggle = useCallback(() => setRevealed((r) => !r), []);
  const value = useMemo(() => ({ revealed, toggle }), [revealed, toggle]);
  return (
    <SlotRevealCtx.Provider value={value}>{children}</SlotRevealCtx.Provider>
  );
}

/** Shared reveal when under a provider; otherwise isolated local state. Exported
 *  so non-SlotAmount surfaces (e.g. chart Y-axis blur) can follow the same toggle. */
export function useSlotReveal(): SlotRevealState {
  const ctx = useContext(SlotRevealCtx);
  const [local, setLocal] = useState(false);
  const localToggle = useCallback(() => setLocal((r) => !r), []);
  return ctx ?? { revealed: local, toggle: localToggle };
}

export function SlotAmount({
  value,
  className,
  blurEm = 0.22,
  interactive = true,
}: {
  value: string;
  className?: string;
  /** Blur radius as a FRACTION of the font size (em) so every figure looks
   *  equally hidden regardless of its size. */
  blurEm?: number;
  /** When false the amount does NOT handle its own tap (no onClick/keyboard, not a
   *  button) — the PARENT drives the reveal. The pie uses this: iOS never fires
   *  `click` on the re-rendering chart, so the pie toggles the shared reveal from a
   *  pointer handler instead, and a self-toggling SlotAmount would double-fire on
   *  desktop. */
  interactive?: boolean;
}) {
  const { revealed, toggle } = useSlotReveal();

  const chars = useMemo(() => value.split(""), [value]);
  // Scramble the whole NUMBER — digits AND its separators (comma/dot) — so the
  // grouping (e.g. thousands split) can't be read off the mask; only the
  // currency symbol/code and sign are kept verbatim.
  const scrambleIdx = useMemo(
    () => chars.flatMap((c, i) => (isBlurable(c) ? [i] : [])),
    [chars],
  );
  // Stable random mask for the resting HIDDEN state (regenerated only when the
  // value changes) so it doesn't flicker between renders.
  const frozenMask = useMemo(() => {
    const arr = [...chars];
    for (const i of scrambleIdx) arr[i] = maskChar(chars[i]!);
    return arr;
  }, [chars, scrambleIdx]);

  const [display, setDisplay] = useState<string[]>(() =>
    revealed ? chars : frozenMask,
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRevealed = useRef(revealed);

  const run = useCallback(
    (toReal: boolean) => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      const target = toReal ? chars : frozenMask;
      let tick = 0;
      timerRef.current = setInterval(() => {
        tick += 1;
        const settled = Math.floor((tick / TICKS) * scrambleIdx.length);
        const arr = [...chars]; // currency + sign verbatim; number scrambled
        scrambleIdx.forEach((idx, k) => {
          arr[idx] = k < settled ? target[idx]! : maskChar(chars[idx]!);
        });
        setDisplay(arr);
        if (tick >= TICKS) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setDisplay(target);
        }
      }, TICK_MS);
    },
    [chars, scrambleIdx, frozenMask],
  );

  // Animate whenever the (shared) reveal state flips.
  useEffect(() => {
    if (prevRevealed.current === revealed) return;
    prevRevealed.current = revealed;
    run(revealed);
  }, [revealed, run]);

  // Re-sync the display when the VALUE changes while idle (not mid-scramble):
  // to the real chars when revealed, to the fresh mask when hidden. Without the
  // revealed branch, an amount that updates in place while revealed (e.g. the pie
  // centre read-out as you click slices) kept showing the OLD value.
  useEffect(() => {
    if (timerRef.current !== null) return; // mid-animation — let it settle
    setDisplay(revealed ? chars : frozenMask);
  }, [chars, frozenMask, revealed]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    },
    [],
  );

  const onClick = (e: ReactMouseEvent) => {
    e.stopPropagation(); // don't also flip the capitalization card
    toggle();
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  };

  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-testid="slot-amount"
      data-revealed={revealed}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      aria-label={revealed ? value : "Amount hidden — tap to reveal"}
      className={className}
      style={{
        cursor: interactive ? "pointer" : "inherit",
        userSelect: "none",
        display: "inline-block",
        // Horizontal breathing room = the blur radius (em, so it scales with the
        // font) — keeps the fuzzy edges of the outer digits from being clipped.
        paddingInline: `${blurEm}em`,
        overflow: "visible",
        // NOTE: proportional figures (no tabular-nums) so the real "1" is narrow
        // and matches its "I" mask; the medium-letter masks match the wider digits.
      }}
    >
      {display.map((ch, i) => {
        // Every non-space char blurs while hidden. No fixed-width box — the mask
        // char is picked to roughly match the width of what it hides.
        const blurThis = isBlurable(chars[i]!);
        return (
          <span
            key={i}
            style={{
              filter: !revealed && blurThis ? `blur(${blurEm}em)` : "none",
              transition: `filter ${BLUR_MS}ms ease`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
