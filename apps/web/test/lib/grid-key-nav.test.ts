/**
 * grid-key-nav.test.ts — desktop keyboard navigation over the spendings grid.
 *
 * Tab / Shift+Tab cycle the per-category quick-add inputs (wrapping; first /
 * last when nothing relevant is focused) — even while a transaction editor is
 * active. ArrowDown/Up walk a column's transaction rows (top / bottom entry
 * points; Up from the first row returns to the quick input). Arrows never
 * hijack a transaction amount editor.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { handleGridKeyNav } from "../../src/lib/grid-key-nav";

function buildGrid(): HTMLElement {
  document.body.innerHTML = `
    <div id="grid">
      <div data-testid="category-column-a">
        <div id="a1" data-txn-nav tabindex="-1"></div>
        <div id="a2" data-txn-nav tabindex="-1"></div>
        <input id="qa" data-testid="quick-entry-food" />
      </div>
      <div data-testid="category-column-b">
        <div id="b1" data-txn-nav tabindex="-1">
          <input id="b1-editor" />
        </div>
        <input id="qb" data-testid="quick-entry-rent" />
      </div>
    </div>`;
  return document.getElementById("grid")!;
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function key(k: string, target: HTMLElement, shiftKey = false) {
  return { key: k, shiftKey, target };
}

let grid: HTMLElement;
beforeEach(() => {
  grid = buildGrid();
});

describe("Tab across quick-add inputs", () => {
  it("focuses the FIRST quick input when nothing relevant is focused", () => {
    expect(handleGridKeyNav(key("Tab", document.body), grid)).toBe(true);
    expect(document.activeElement).toBe(el("qa"));
  });

  it("moves to the next category's input and wraps at the end", () => {
    el("qa").focus();
    handleGridKeyNav(key("Tab", el("qa")), grid);
    expect(document.activeElement).toBe(el("qb"));
    handleGridKeyNav(key("Tab", el("qb")), grid);
    expect(document.activeElement).toBe(el("qa"));
  });

  it("Shift+Tab focuses the LAST input when nothing relevant is focused, then cycles backwards", () => {
    handleGridKeyNav(key("Tab", document.body, true), grid);
    expect(document.activeElement).toBe(el("qb"));
    handleGridKeyNav(key("Tab", el("qb"), true), grid);
    expect(document.activeElement).toBe(el("qa"));
  });

  it("jumps from a focused ROW to the next category's input", () => {
    el("a1").focus();
    handleGridKeyNav(key("Tab", el("a1")), grid);
    expect(document.activeElement).toBe(el("qb"));
  });

  it("still cycles quick inputs while a transaction editor is active", () => {
    el("b1-editor").focus();
    handleGridKeyNav(key("Tab", el("b1-editor")), grid);
    expect(document.activeElement).toBe(el("qa")); // wraps past column b
  });
});

describe("Arrow navigation within a column", () => {
  it("Down from the quick input focuses the TOP transaction", () => {
    el("qa").focus();
    expect(handleGridKeyNav(key("ArrowDown", el("qa")), grid)).toBe(true);
    expect(document.activeElement).toBe(el("a1"));
  });

  it("Down walks the rows and clamps at the last", () => {
    el("a1").focus();
    handleGridKeyNav(key("ArrowDown", el("a1")), grid);
    expect(document.activeElement).toBe(el("a2"));
    handleGridKeyNav(key("ArrowDown", el("a2")), grid);
    expect(document.activeElement).toBe(el("a2"));
  });

  it("Up from the quick input focuses the BOTTOM transaction", () => {
    el("qa").focus();
    handleGridKeyNav(key("ArrowUp", el("qa")), grid);
    expect(document.activeElement).toBe(el("a2"));
  });

  it("Up from the first row returns to the quick input", () => {
    el("a2").focus();
    handleGridKeyNav(key("ArrowUp", el("a2")), grid);
    expect(document.activeElement).toBe(el("a1"));
    handleGridKeyNav(key("ArrowUp", el("a1")), grid);
    expect(document.activeElement).toBe(el("qa"));
  });

  it("Down with no context starts at the first column's top row", () => {
    handleGridKeyNav(key("ArrowDown", document.body), grid);
    expect(document.activeElement).toBe(el("a1"));
  });

  it("does NOT hijack arrows inside a transaction amount editor", () => {
    el("b1-editor").focus();
    expect(handleGridKeyNav(key("ArrowDown", el("b1-editor")), grid)).toBe(
      false,
    );
    expect(document.activeElement).toBe(el("b1-editor"));
  });
});
