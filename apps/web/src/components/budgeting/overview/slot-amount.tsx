"use client";
/**
 * slot-amount.tsx — a privacy amount that hides behind random UPPERCASE chars and
 * reveals the real value on tap with a quick "slot-machine" scramble (r41).
 *
 * Replaces the old global eye-toggle + redaction bars: each figure is
 * independently tappable, starts HIDDEN, and toggles with a left→right settling
 * scramble. Only the digits are scrambled — the currency symbol/code, separators
 * and sign are kept verbatim ("do not make currency random"). Random chars are
 * A–Z uppercase only.
 *
 * SECURITY: the real digits are NEVER in the DOM while hidden — the resting state
 * renders a frozen random-uppercase mask. The real string lives only in props /
 * JS memory (same posture as the previous bullet mask), surfaced to the DOM only
 * once the user reveals it.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

const TICK_MS = 45;
const TICKS = 12; // ~0.5s total scramble

const isDigit = (c: string) => c >= "0" && c <= "9";
const randUpper = () =>
  String.fromCharCode(65 + Math.floor(Math.random() * 26));

export function SlotAmount({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const chars = useMemo(() => value.split(""), [value]);
  const digitIdx = useMemo(
    () => chars.flatMap((c, i) => (isDigit(c) ? [i] : [])),
    [chars],
  );
  // A stable random mask for the resting HIDDEN state (regenerated only when the
  // value changes) so it doesn't flicker between renders.
  const frozenMask = useMemo(() => {
    const arr = [...chars];
    for (const i of digitIdx) arr[i] = randUpper();
    return arr;
  }, [chars, digitIdx]);

  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);
  const [display, setDisplay] = useState<string[]>(frozenMask);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const run = useCallback(
    (toReal: boolean) => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      const target = toReal ? chars : frozenMask;
      let tick = 0;
      timerRef.current = setInterval(() => {
        tick += 1;
        // Digits settle progressively left→right; the rest keep scrambling.
        const settled = Math.floor((tick / TICKS) * digitIdx.length);
        const arr = [...chars]; // non-digits verbatim (currency / separators / sign)
        digitIdx.forEach((idx, k) => {
          arr[idx] = k < settled ? target[idx]! : randUpper();
        });
        setDisplay(arr);
        if (tick >= TICKS) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setDisplay(target);
        }
      }, TICK_MS);
    },
    [chars, digitIdx, frozenMask],
  );

  const toggle = useCallback(() => {
    const next = !revealedRef.current;
    revealedRef.current = next;
    setRevealed(next);
    run(next);
  }, [run]);

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
      style={{ cursor: "pointer", userSelect: "none" }}
    >
      {display.join("")}
    </span>
  );
}
