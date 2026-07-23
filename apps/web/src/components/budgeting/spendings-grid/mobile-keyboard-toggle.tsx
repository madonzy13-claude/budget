"use client";
/**
 * mobile-keyboard-toggle.tsx — ABC ⇄ 123 soft-keyboard switch (260722-d).
 *
 * A quick add/edit field opens the NUMBER keyboard (inputMode=decimal) so an
 * amount is fast to type. But a note (typed after a space — see parseAmountAndNote)
 * needs letters. This floating button sits just above the soft keyboard and flips
 * the field between the number and text keyboards.
 *
 * Only mounts on coarse-pointer (touch) devices; the parent renders it while ITS
 * input is focused, so exactly one is ever on screen (and on touch a focused
 * field means the keyboard is up).
 *
 * POSITIONING (260723 rewrite): earlier tries keyed off `window.innerHeight −
 * visualViewport.height`, but iOS SHRINKS window.innerHeight (and even
 * documentElement.clientHeight) with the keyboard, so that difference was ≈0 and
 * the button never appeared. This version uses ONLY the visualViewport: its
 * bottom edge (`height + offsetTop`, in layout-viewport px) is the top of the
 * keyboard, and the button is `position: fixed` + `translateY` to just above it.
 * It's HIDDEN when the keyboard is closed by comparing that bottom edge to the
 * STABLE window.screen.height (a device constant) — when the keyboard drops, the
 * visible area grows back past ~80% of the screen. `-52` (button height + gap) is
 * the knob to tune the lift.
 *
 * iOS reads `inputmode` at FOCUS time — changing it on an already-focused input
 * does nothing. So we set the attribute imperatively, then blur+refocus INSIDE the
 * tap gesture (focus() within a user gesture re-shows the keyboard, now the new
 * type). `switchingRef` tells the parent's blur handler this blur is a
 * keyboard-switch, not a real commit — so it must NOT save the entry.
 *
 * PORTALED TO document.body (260723-1): the BDP tab carousel wraps every pane in
 * a framer motion.div that rests at `transform: translateX(0%)` — a non-`none`
 * transform makes it the containing block for `position: fixed` descendants, so a
 * button rendered in-tree would anchor to the carousel (and get clipped) instead
 * of the viewport. Rendering into body escapes that.
 */
import {
  useEffect,
  useState,
  type RefObject,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";

// Button height + gap — how far above the keyboard's top edge the button sits.
const LIFT = 52;

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
  // Y of the visible area's bottom (layout-viewport px) = the keyboard's top.
  const [bottomY, setBottomY] = useState<number | null>(null);
  const [coarse] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(pointer: coarse)")?.matches,
  );

  useEffect(() => {
    if (!coarse) return;
    const vv = window.visualViewport;
    if (!vv) {
      setBottomY(window.innerHeight);
      return;
    }
    const update = () => setBottomY(vv.height + vv.offsetTop);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [coarse]);

  // Hide when the keyboard is closed. The visible-area bottom (`bottomY`) sits
  // well short of the STABLE screen height only while the keyboard is up; when it
  // closes, visualViewport grows back toward the screen and bottomY climbs past
  // the threshold. Uses window.screen.height (device-fixed) — NOT innerHeight /
  // clientHeight, both of which iOS shrinks with the keyboard.
  const screenH =
    typeof window !== "undefined" ? (window.screen?.height ?? 0) : 0;
  const keyboardUp =
    bottomY !== null && (screenH > 0 ? bottomY < screenH * 0.8 : true);

  if (
    !coarse ||
    bottomY === null ||
    !keyboardUp ||
    typeof document === "undefined"
  )
    return null;

  return createPortal(
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
      style={{
        position: "fixed",
        top: 0,
        right: 12,
        transform: `translateY(${Math.max(bottomY - LIFT, 8)}px)`,
        zIndex: 2147483000,
      }}
      // 260723-2: yellow pill (was a grey rectangle → invisible on the grey
      // keyboard bar). Brand accent + dark bold text reads clearly.
      className="rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-[var(--on-primary)] shadow-lg ring-1 ring-black/10 [-webkit-tap-highlight-color:transparent]"
    >
      {mode === "numeric" ? "ABC" : "123"}
    </button>,
    document.body,
  );
}
