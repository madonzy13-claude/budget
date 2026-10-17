/**
 * close-button-target.test.tsx — the X on a popup has to be tappable
 * (user, 261016: "In all popups, the cross is so small that it's hard to
 * tap it").
 *
 * The icon was 16px with no padding around it, so the whole hit area was
 * 16×16 — a quarter of the 44×44 both Apple and Material call the minimum
 * for a thumb. Both shared popup shells (Dialog and Sheet) own their own X,
 * so the size is asserted on each: every popup in the app gets its close
 * from one of these two.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent } from "../../../src/components/ui/dialog";
import { Sheet, SheetContent } from "../../../src/components/ui/sheet";

/** Tailwind's h-11/w-11 is 2.75rem = 44px, the thumb minimum. */
function expectThumbSized(el: HTMLElement) {
  expect(el.className).toContain("h-11");
  expect(el.className).toContain("w-11");
  // A box only helps if the icon sits in the middle of it.
  expect(el.className).toContain("items-center");
  expect(el.className).toContain("justify-center");
}

describe("popup close button", () => {
  it("gives the dialog's X a 44px tap target", () => {
    render(
      <Dialog open>
        <DialogContent>body</DialogContent>
      </Dialog>,
    );
    expectThumbSized(screen.getByRole("button", { name: /close/i }));
  });

  it("gives the sheet's X a 44px tap target", () => {
    render(
      <Sheet open>
        <SheetContent>body</SheetContent>
      </Sheet>,
    );
    expectThumbSized(screen.getByRole("button", { name: /close/i }));
  });
});
