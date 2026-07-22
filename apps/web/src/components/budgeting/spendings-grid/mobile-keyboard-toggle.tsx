"use client";
/**
 * mobile-keyboard-toggle.tsx — ABC ⇄ 123 soft-keyboard switch (260722-d).
 *
 * A quick add/edit field opens the NUMBER keyboard (inputMode=decimal) so an
 * amount is fast to type. But a note (typed after a space — see parseAmountAndNote)
 * needs letters. This floating button sits just above the soft keyboard and flips
 * the field between the number and text keyboards.
 *
 * Only mounts on coarse-pointer (touch) devices, and only shows while a soft
 * keyboard is actually up (visualViewport shrinks by > ~120px). The parent renders
 * it while ITS input is focused, so exactly one button is ever on screen.
 *
 * iOS reads `inputmode` at FOCUS time — changing it on an already-focused input
 * does nothing. So we set the attribute imperatively, then blur+refocus INSIDE the
 * tap gesture (focus() within a user gesture re-shows the keyboard, now the new
 * type). `switchingRef` tells the parent's blur handler this blur is a
 * keyboard-switch, not a real commit — so it must NOT save the entry.
 *
 * Sandbox has no WebKit, so this is verified on-device; `KB_INSET_MIN` and the
 * `+8` lift are the knobs to tune if the button sits wrong on a real keyboard.
 */
import {
  useEffect,
  useState,
  type RefObject,
  type MutableRefObject,
} from "react";

const KB_INSET_MIN = 120; // px of viewport shrink that counts as "keyboard up"

export function MobileKeyboardToggle({
  inputRef,
  mode,
  onToggle,
  switchingRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  mode: "numeric" | "text";
  onToggle: () => void;
  /** Set true before the switch-blur so the parent's onBlur skips its save. */
  switchingRef: MutableRefObject<boolean>;
}) {
  // null while no keyboard is up → the button is hidden.
  const [kbHeight, setKbHeight] = useState<number | null>(null);
  const [coarse] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(pointer: coarse)")?.matches,
  );

  useEffect(() => {
    if (!coarse) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(
        0,
        window.innerHeight - (vv.height + vv.offsetTop),
      );
      setKbHeight(inset > KB_INSET_MIN ? inset : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [coarse]);

  if (!coarse || kbHeight === null) return null;

  return (
    <button
      type="button"
      data-testid="kbd-mode-toggle"
      aria-label={
        mode === "numeric"
          ? "Switch to the text keyboard"
          : "Switch to the number keyboard"
      }
      // Keep focus on the input while the finger is down so the tap itself
      // doesn't blur it (that would close the keyboard before we can switch it).
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const el = inputRef.current;
        onToggle(); // flip the React state (idempotent with the imperative set)
        if (!el) return;
        // The DOM attribute must be the NEW value before we refocus, because
        // React's re-render from onToggle hasn't flushed yet and iOS reads the
        // attribute on focus.
        const nextInputMode = mode === "numeric" ? "text" : "decimal";
        const caret = el.selectionStart;
        switchingRef.current = true; // guard the parent's blur-save
        el.setAttribute("inputmode", nextInputMode);
        el.blur();
        el.focus();
        try {
          if (caret != null) el.setSelectionRange(caret, caret);
        } catch {
          /* number-like inputs may reject setSelectionRange — focus is enough */
        }
      }}
      style={{ position: "fixed", right: 12, bottom: kbHeight + 8, zIndex: 60 }}
      className="rounded-md border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-3.5 py-2 text-sm font-semibold text-[var(--body-on-dark)] shadow-lg [-webkit-tap-highlight-color:transparent]"
    >
      {mode === "numeric" ? "ABC" : "123"}
    </button>
  );
}
