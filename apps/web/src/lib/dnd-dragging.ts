/**
 * dnd-dragging.ts — a body-level "a drag is in flight" marker for dnd-kit.
 *
 * Document-level keydown handlers (the assets tab's roving nav, for one) listen
 * in the CAPTURE phase and consume keys that a drag sensor also wants. Guarding
 * on `document.activeElement` is not enough: the activator handle UNMOUNTS for
 * the length of the drag (the row moves into the DragOverlay), so focus falls
 * back to <body> and a focus-based guard stops matching exactly when the DROP
 * key arrives — the lift works, the drop is swallowed, and the drag hangs.
 *
 * Every DndContext whose items can be dragged by keyboard sets this across the
 * drag; `isDndDragging()` is what a document-level handler checks before acting.
 */
const ATTR = "data-dnd-dragging";

export function setDndDragging(on: boolean): void {
  if (typeof document === "undefined") return;
  if (on) document.body.setAttribute(ATTR, "true");
  else document.body.removeAttribute(ATTR);
}

export function isDndDragging(): boolean {
  return typeof document !== "undefined" && document.body.hasAttribute(ATTR);
}
