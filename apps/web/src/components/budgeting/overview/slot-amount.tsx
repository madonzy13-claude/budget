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

// Mask EVERYTHING except spaces — digits, separators (comma/dot), sign (+/−) AND
// the currency symbol — so a glance can't read the magnitude, sign or currency.
// Every masked slot is pinned to 1ch (tabular width) below, in BOTH states, so a
// masked letter occupies the same space as whatever it hides and the total width
// never changes on reveal/hide (the digits are tabular = 1ch already; commas /
// currency sit centred in their 1ch slot).
const isBlurable = (c: string) => c !== " ";
// Mask alphabet: uppercase letters, EXCLUDING the two widest glyphs (M, W) so a
// masked letter never overflows its 1ch box. Every digit is replaced by one of
// these (kept uppercase — no lowercase/real digits leak while hidden).
const MASK_ALPHABET = "ABCDEFGHIJKLNOPQRSTUVXYZ";
const maskChar = (_original?: string) =>
  MASK_ALPHABET[Math.floor(Math.random() * MASK_ALPHABET.length)]!;

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
}: {
  value: string;
  className?: string;
  /** Blur radius as a FRACTION of the font size (em) so every figure looks
   *  equally hidden regardless of its size. */
  blurEm?: number;
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
      role="button"
      tabIndex={0}
      data-testid="slot-amount"
      data-revealed={revealed}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={revealed ? value : "Amount hidden — tap to reveal"}
      className={className}
      style={{
        cursor: "pointer",
        userSelect: "none",
        display: "inline-block",
        // Horizontal breathing room = the blur radius (em, so it scales with the
        // font) — keeps the fuzzy edges of the outer digits from being clipped.
        paddingInline: `${blurEm}em`,
        overflow: "visible",
        // Tabular figures so the real digits are even-width (the narrow "I" mask
        // sits close to them) — but no per-slot fixed width, so commas keep their
        // natural narrow size.
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {display.map((ch, i) => {
        // Digits AND separators (comma/dot) blur; the currency symbol/code and
        // sign stay sharp. Blur fades out on reveal / in on hide, in step with
        // the scramble.
        const blurThis = isBlurable(chars[i]!);
        return (
          <span
            key={i}
            style={{
              filter: !revealed && blurThis ? `blur(${blurEm}em)` : "none",
              transition: `filter ${BLUR_MS}ms ease`,
              // Digit slots only: pin to one tabular digit-width and centre, so a
              // masked letter and the real digit occupy identical space (no jump).
              // Separators/sign keep their natural width (no comma padding).
              ...(blurThis
                ? {
                    display: "inline-block",
                    width: "1ch",
                    textAlign: "center" as const,
                  }
                : {}),
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
