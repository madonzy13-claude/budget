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
      onBlur={(e) => {
        // Only commit when focus leaves the entire editor container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onCommit();
        }
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
