/**
 * slide-collapse.test.tsx — content slides open / shut on grid rows (round-4
 * gaps 18 + 19): the FIRST open slides too (mounts at 0fr, opens next frame),
 * a close slides before unmounting, and `instant` skips the animation.
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SlideCollapse } from "../../../src/components/common/slide-collapse";

const ui = (open: boolean, extra: Record<string, unknown> = {}) => (
  <SlideCollapse open={open} data-testid="slide" {...extra}>
    <p>content</p>
  </SlideCollapse>
);
const rows = () => screen.getByTestId("slide").style.gridTemplateRows;

describe("SlideCollapse", () => {
  it("closed at first: nothing rendered", () => {
    render(ui(false));
    expect(screen.queryByTestId("slide")).toBeNull();
  });

  it("the first open starts shut and slides open on the next frame", async () => {
    const { rerender } = render(ui(false));
    rerender(ui(true));
    expect(rows()).toBe("0fr");
    await waitFor(() => expect(rows()).toBe("1fr"));
    expect(screen.getByTestId("slide").className).toMatch(
      /transition-\[grid-template-rows\]/,
    );
  });

  it("opened from the start slides open too", async () => {
    render(ui(true));
    expect(rows()).toBe("0fr");
    await waitFor(() => expect(rows()).toBe("1fr"));
  });

  it("a close slides shut, hides from assistive tech, then unmounts", async () => {
    const { rerender } = render(ui(true));
    await waitFor(() => expect(rows()).toBe("1fr"));
    rerender(ui(false));
    expect(rows()).toBe("0fr");
    expect(screen.getByTestId("slide")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("slide")).toHaveAttribute("inert");
    await waitFor(() => expect(screen.queryByTestId("slide")).toBeNull());
  });

  it("keepMounted stays after closing", async () => {
    const { rerender } = render(ui(true, { keepMounted: true }));
    await waitFor(() => expect(rows()).toBe("1fr"));
    rerender(ui(false, { keepMounted: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByTestId("slide")).toBeInTheDocument();
  });

  it("instant opens and closes without a slide", () => {
    const { rerender } = render(ui(true, { instant: true }));
    expect(rows()).toBe("1fr");
    rerender(ui(false, { instant: true }));
    expect(screen.queryByTestId("slide")).toBeNull();
  });

  it("clips vertically only (a swiped child is never cut on the left)", async () => {
    render(ui(true));
    const clip = screen.getByTestId("slide").firstElementChild as HTMLElement;
    expect(clip.style.overflowY).toBe("clip");
    expect(clip.style.overflowX).toBe("visible");
  });
});
