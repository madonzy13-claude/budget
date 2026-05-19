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

  const beginEdit = () => {
    if (props.disabled || saving) return;
    setFailed(false);
    setEditing(true);
  };

  const onCancel = React.useCallback(() => {
    setDraft(props.value);
    setEditing(false);
  }, [props.value]);

  const onCommit = React.useCallback(async () => {
    // Use Object.is for value equality (handles primitives + same-ref objects)
    if (Object.is(draft, props.value)) {
      setEditing(false);
      return;
    }
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
        // UAT-PH5-T3-36 cont.: `manipulation` tells the browser this
        // element does not participate in horizontal panning, so a tap
        // on the resting cell registers as a click immediately. Without
        // this, the wallet row's swipe wrapper (touch-action: pan-x by
        // virtue of overflow-x: auto) sometimes interpreted the touch
        // as the start of a horizontal scroll and revealed the Delete
        // button momentarily before the click fired.
        style={{ touchAction: "manipulation" }}
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
      data-testid={props.testId ? `${props.testId}-editor` : undefined}
      // UAT-PH5-T3-36: ancestor scroll containers (e.g. the mobile
      // wallet row swipe wrapper) read this attribute to relax their
      // overflow while an editor is active. Without it Radix Select
      // on touch defers `open` because it detects a scrollable parent.
      data-editing="true"
      // Same rationale as resting cell — the active editor sits inside
      // the swipe wrapper, taps on it should not begin a pan.
      style={{ touchAction: "manipulation" }}
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
          className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
