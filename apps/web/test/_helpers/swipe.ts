import { fireEvent } from "@testing-library/react";

/** A touch swipe through pointer events — the path useSwipeReveal listens on. */
export function touchSwipe(el: Element, dx: number) {
  const at = (clientX: number) => ({
    pointerType: "touch",
    pointerId: 7,
    clientX,
    clientY: 10,
  });
  fireEvent.pointerDown(el, at(300));
  fireEvent.pointerMove(el, at(300 + dx / 2));
  fireEvent.pointerMove(el, at(300 + dx));
  fireEvent.pointerUp(el, at(300 + dx));
}
