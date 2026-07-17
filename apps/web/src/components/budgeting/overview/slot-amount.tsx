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

const isDigit = (c: string) => c >= "0" && c <= "9";
// Blur the whole NUMBER — digits AND its separators (comma / dot) — so the
// grouping doesn't peek through; only the currency symbol/code and sign stay
// sharp ("do not blur currency").
const isBlurable = (c: string) =>
  isDigit(c) || c === "," || c === "." || c === "-" || c === "+";
const randUpper = () =>
  String.fromCharCode(65 + Math.floor(Math.random() * 26));
// Mask char for a scrambled slot: a random uppercase letter for a digit; a
// fixed narrow "I" for a separator (comma/dot) so it barely takes space and the
// grouping stays hidden.
const maskChar = (original: string) => (isDigit(original) ? randUpper() : "I");

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

/** Shared reveal when under a provider; otherwise isolated local state. */
function useSlotReveal(): SlotRevealState {
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

  // Refresh the resting mask if the value changes while hidden and idle.
  useEffect(() => {
    if (!revealed && timerRef.current === null) setDisplay(frozenMask);
  }, [frozenMask, revealed]);

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
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
