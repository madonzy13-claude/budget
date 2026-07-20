"use client";
/**
 * inline-edit-cell.tsx — Generic click-to-edit atom.
 *
 * T-05-10: No raw-HTML APIs used — React auto-escapes JSX text content.
 * D-PH5-E5: Spinner appears only after 200ms threshold to avoid flash.
 * D-PH5-E5: Failed state reverts draft + shows 1px destructive ring.
 */
import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { windowPanCorrection } from "@/lib/ios-keyboard-pan";

export interface InlineEditCellProps<T> {
  value: T;
  render: (v: T) => React.ReactNode;
  renderEditor: (
    draft: T,
    onChange: (v: T) => void,
    onCommit: () => void,
    onCancel: () => void,
  ) => React.ReactNode;
  onSave: (v: T) => Promise<void>;
  ariaLabel: string;
  disabled?: boolean;
  testId?: string;
}

export function InlineEditCell<T>(props: InlineEditCellProps<T>) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<T>(props.value);
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [showSpinner, setShowSpinner] = React.useState(false);
  const spinnerTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Sync value when not editing
  React.useEffect(() => {
    if (!editing) setDraft(props.value);
  }, [props.value, editing]);

  // UAT-PH5-T3-50: single-commit guard. Some editor renderers wire
  // Enter to both `input.blur()` AND propagate to InlineEditCell's own
  // Enter handler, which fires onCommit twice. The first commit reads
  // a stale props.value (mutation hasn't settled), so the second
  // commit re-posts the same delta, double-applying. Track per-edit-
  // session in a ref so subsequent commits within the same session
  // no-op until the next beginEdit cycle.
  const committedRef = React.useRef(false);
  const editorRef = React.useRef<HTMLDivElement | null>(null);

  // iOS standalone pans the WINDOW on keyboard open (vpdbg: winY/seTop moves,
  // <main> scrollTop stays 0) and the FIRST open after app launch overshoots
  // several-fold, shoving the edited row under the status bar. Correct the
  // window scroll — and ONLY the window — whenever the visual viewport
  // changes while an editor is open. No-op when the input is already visible
  // (Safari, and every well-behaved later open).
  React.useEffect(() => {
    if (!editing) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const input = editorRef.current?.querySelector<HTMLElement>(
      "input, textarea",
    );
    if (!input) return;
    const correct = () => {
      const rect = input.getBoundingClientRect();
      const delta = windowPanCorrection({
        inputTop: rect.top,
        inputBottom: rect.bottom,
        vvOffsetTop: vv.offsetTop,
        vvHeight: vv.height,
      });
      if (delta !== 0) window.scrollBy(0, delta);
    };
    vv.addEventListener("resize", correct);
    vv.addEventListener("scroll", correct);
    // Backstop in case the keyboard settles without a final vv event.
    const t = setTimeout(correct, 450);
    return () => {
      vv.removeEventListener("resize", correct);
      vv.removeEventListener("scroll", correct);
      clearTimeout(t);
    };
  }, [editing]);

  const beginEdit = () => {
    if (props.disabled || saving) return;
    setFailed(false);
    committedRef.current = false;
    // 260625: seed the draft from the LATEST props.value at edit-start, not from
    // the `draft` state synced by the effect below. That effect (deps
    // [props.value, editing]) can be PREEMPTED by this beginEdit: when a
    // background refetch updates props.value (e.g. the reserves cell hydrating
    // 0 → 900) the cell first re-renders + PAINTS the new value via
    // `render(props.value)`, but if a click flips `editing` true before the
    // value-sync effect runs, the effect then skips (`if (!editing)` is false)
    // and `draft` stays at the STALE value → the editor seeds the old number
    // (0) even though the cell visibly shows 900, so a commit no-ops on the
    // Object.is(draft, value) guard. Seeding here closes that window.
    setDraft(props.value);
    setEditing(true);
  };

  const onCancel = React.useCallback(() => {
    setDraft(props.value);
    setEditing(false);
  }, [props.value]);

  const onCommit = React.useCallback(async () => {
    // UAT-PH5-T3-50: refuse re-entry once a commit has been initiated
    // in this edit session — guards against blur+Enter double-fire that
    // posted the same delta twice (and pushed the persisted balance
    // past the user's intended value).
    if (committedRef.current) return;
    // Use Object.is for value equality (handles primitives + same-ref objects)
    if (Object.is(draft, props.value)) {
      setEditing(false);
      return;
    }
    committedRef.current = true;
    setSaving(true);
    spinnerTimerRef.current = setTimeout(() => setShowSpinner(true), 200);
    try {
      await props.onSave(draft);
      setFailed(false);
    } catch {
      setDraft(props.value);
      setFailed(true);
    } finally {
      if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current);
      setShowSpinner(false);
      setSaving(false);
      setEditing(false);
    }
  }, [draft, props]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      beginEdit();
    }
  };

  const onEditorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      onCommit();
    }
  };

  if (!editing) {
    return (
      <div
        data-testid={props.testId}
        data-state={failed ? "failed" : "rest"}
        role="button"
        tabIndex={props.disabled ? -1 : 0}
        onClick={beginEdit}
        onKeyDown={onKeyDown}
        aria-label={props.ariaLabel}
        aria-disabled={props.disabled}
        // UAT-PH5-T3-38: `pan-y` only — touches on the cell may scroll
        // the page vertically but must NOT initiate horizontal panning.
        // The earlier `manipulation` value still permitted pan in both
        // axes per spec, so iOS Safari momentarily scrolled the wallet
        // row's swipe wrapper and flashed the Delete button before the
        // tap registered as a click. `pan-y` blocks horizontal pan
        // outright from this element, eliminating that flash.
        style={{ touchAction: "pan-y" }}
        className={[
          // UAT-PH5-T3-11: I-beam on hover so the editable affordance reads
          // as "click to edit text" instead of "navigate / click button".
          props.disabled ? "cursor-default" : "cursor-text",
          failed ? "ring-1 ring-[var(--destructive)]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {props.render(props.value)}
        {failed && (
          <RotateCcw
            className="ml-1 inline h-3 w-3 text-[var(--destructive)]"
            aria-hidden="true"
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={editorRef}
      data-testid={props.testId ? `${props.testId}-editor` : undefined}
      // UAT-PH5-T3-36: ancestor scroll containers (e.g. the mobile
      // wallet row swipe wrapper) read this attribute to relax their
      // overflow while an editor is active. Without it Radix Select
      // on touch defers `open` because it detects a scrollable parent.
      data-editing="true"
      // Same rationale as resting cell — see UAT-PH5-T3-38. The editor
      // also disables horizontal pan so typing/tapping inside it never
      // shifts the swipe wrapper underneath.
      style={{ touchAction: "pan-y" }}
      onBlur={(e) => {
        // UAT-PH5-T3-36: only commit when focus leaves the editor AND
        // hasn't landed inside a Radix portal that we own (e.g. the
        // currency Select's listbox, an AlertDialog, etc.). Portals
        // render in document.body — outside `currentTarget` — so the
        // naive containment check incorrectly fires onCommit, which
        // unmounts the editor and detaches the listbox before the
        // user can tap an option. Defer to the next frame so the
        // browser has finished moving focus to the new portal node.
        const editor = e.currentTarget;
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        // Fast path: focus moved to an element inside the editor — no commit.
        if (relatedTarget && editor.contains(relatedTarget)) return;
        // Defer: lets Radix attach the portal and move focus to it before
        // we sample document.activeElement.
        requestAnimationFrame(() => {
          const active = document.activeElement as HTMLElement | null;
          if (active && editor.contains(active)) return;
          if (
            active?.closest(
              '[role="listbox"],[role="dialog"],[data-radix-popper-content-wrapper]',
            )
          ) {
            return;
          }
          onCommit();
        });
      }}
      onKeyDown={onEditorKeyDown}
      className="relative"
    >
      {props.renderEditor(draft, setDraft, onCommit, onCancel)}
      {showSpinner && (
        <Loader2
          className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
