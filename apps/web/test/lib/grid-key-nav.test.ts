/**
 * grid-key-nav.test.ts — desktop keyboard navigation over the spendings grid.
 *
 * r40b: Tab is no longer intercepted (native tab order stays). ArrowUp/Down walk
 * a column's transaction rows (top / bottom entry; Up from the first row returns
 * to the quick input). ArrowLeft/Right on a ROW hop to the SAME row index in the
 * adjacent column, clamping to that column's LAST row when it has fewer (and
 * falling back to its quick input when it has none). Arrows never hijack a text
 * editor or a quick input's caret.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { handleGridKeyNav } from "../../src/lib/grid-key-nav";

function buildGrid(): HTMLElement {
  document.body.innerHTML = `
    <div id="grid">
      <div data-testid="category-column-a">
        <div id="a1" data-txn-nav tabindex="-1"></div>
        <div id="a2" data-txn-nav tabindex="-1"></div>
        <div id="a3" data-txn-nav tabindex="-1"></div>
        <input id="qa" data-testid="quick-entry-food" />
      </div>
      <div data-testid="category-column-b">
        <div id="b1" data-txn-nav tabindex="-1">
          <input id="b1-editor" />
        </div>
        <input id="qb" data-testid="quick-entry-rent" />
      </div>
      <div data-testid="category-column-c">
        <input id="qc" data-testid="quick-entry-fun" />
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

describe("Tab is no longer intercepted", () => {
  it("returns false for Tab (native tab order handles it now)", () => {
    expect(handleGridKeyNav(key("Tab", document.body), grid)).toBe(false);
    expect(handleGridKeyNav(key("Tab", el("qa"), true), grid)).toBe(false);
  });
});

describe("Entry: any arrow from nothing focuses the first quick input", () => {
  for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
    it(`${k} from <body> focuses the first column's quick input`, () => {
      expect(handleGridKeyNav(key(k, document.body), grid)).toBe(true);
      expect(document.activeElement).toBe(el("qa"));
    });
  }
});

describe("Vertical cycle within a column ([rows…, quick input])", () => {
  it("Down from the quick input focuses the TOP transaction", () => {
    el("qa").focus();
    expect(handleGridKeyNav(key("ArrowDown", el("qa")), grid)).toBe(true);
    expect(document.activeElement).toBe(el("a1"));
  });

  it("Up from the quick input focuses the BOTTOM transaction", () => {
    el("qa").focus();
    handleGridKeyNav(key("ArrowUp", el("qa")), grid);
    expect(document.activeElement).toBe(el("a3"));
  });

  it("Down walks the rows then WRAPS from the bottom row to the quick input", () => {
    el("a1").focus();
    handleGridKeyNav(key("ArrowDown", el("a1")), grid);
    expect(document.activeElement).toBe(el("a2"));
    handleGridKeyNav(key("ArrowDown", el("a2")), grid);
    expect(document.activeElement).toBe(el("a3"));
    handleGridKeyNav(key("ArrowDown", el("a3")), grid); // bottom → quick input
    expect(document.activeElement).toBe(el("qa"));
  });

  it("Up from the TOP row wraps to the quick input", () => {
    el("a2").focus();
    handleGridKeyNav(key("ArrowUp", el("a2")), grid);
    expect(document.activeElement).toBe(el("a1"));
    handleGridKeyNav(key("ArrowUp", el("a1")), grid); // top → quick input
    expect(document.activeElement).toBe(el("qa"));
  });

  it("does NOT hijack arrows inside a transaction amount editor", () => {
    el("b1-editor").focus();
    expect(handleGridKeyNav(key("ArrowDown", el("b1-editor")), grid)).toBe(
      false,
    );
    expect(document.activeElement).toBe(el("b1-editor"));
  });
});

describe("Arrow Left/Right hop between columns on a ROW", () => {
  it("Right hops to the same row index in the next column", () => {
    el("a1").focus();
    expect(handleGridKeyNav(key("ArrowRight", el("a1")), grid)).toBe(true);
    expect(document.activeElement).toBe(el("b1"));
  });

  it("Right clamps to the neighbor's LAST row when it has fewer", () => {
    el("a3").focus(); // index 2; column b has only b1 (index 0)
    handleGridKeyNav(key("ArrowRight", el("a3")), grid);
    expect(document.activeElement).toBe(el("b1"));
  });

  it("Left hops back to the same row index in the previous column", () => {
    el("b1").focus();
    handleGridKeyNav(key("ArrowLeft", el("b1")), grid);
    expect(document.activeElement).toBe(el("a1"));
  });

  it("falls back to the neighbor's quick input when it has NO rows", () => {
    el("b1").focus();
    handleGridKeyNav(key("ArrowRight", el("b1")), grid);
    expect(document.activeElement).toBe(el("qc"));
  });

  it("does nothing at the left edge (no previous column)", () => {
    el("a1").focus();
    expect(handleGridKeyNav(key("ArrowLeft", el("a1")), grid)).toBe(false);
    expect(document.activeElement).toBe(el("a1"));
  });

  it("does NOT handle Left/Right on a quick input (the input owns its caret)", () => {
    el("qa").focus();
    expect(handleGridKeyNav(key("ArrowLeft", el("qa")), grid)).toBe(false);
    expect(handleGridKeyNav(key("ArrowRight", el("qa")), grid)).toBe(false);
  });

  it("does NOT handle Left/Right inside a transaction amount editor", () => {
    el("b1-editor").focus();
    expect(handleGridKeyNav(key("ArrowLeft", el("b1-editor")), grid)).toBe(
      false,
    );
  });
});

describe("Cmd/Ctrl modifier jumps", () => {
  const mod = (k: string, target: HTMLElement, extra = {}) => ({
    key: k,
    shiftKey: false,
    metaKey: true,
    target,
    ...extra,
  });

  it("Cmd+Right jumps to the LAST column (empty → its quick input)", () => {
    el("a1").focus();
    expect(handleGridKeyNav(mod("ArrowRight", el("a1")), grid)).toBe(true);
    expect(document.activeElement).toBe(el("qc")); // column c has no rows
  });

  it("Cmd+Left jumps to the FIRST column at the same row index", () => {
    el("b1").focus();
    handleGridKeyNav(mod("ArrowLeft", el("b1")), grid);
    expect(document.activeElement).toBe(el("a1"));
  });

  it("Cmd+Left at the first column does nothing", () => {
    el("a2").focus();
    expect(handleGridKeyNav(mod("ArrowLeft", el("a2")), grid)).toBe(false);
    expect(document.activeElement).toBe(el("a2"));
  });

  it("Cmd+Up jumps to the quick input; Cmd+Down jumps to the bottom row", () => {
    el("a2").focus();
    handleGridKeyNav(mod("ArrowUp", el("a2")), grid);
    expect(document.activeElement).toBe(el("qa"));
    el("a1").focus();
    handleGridKeyNav(mod("ArrowDown", el("a1")), grid);
    expect(document.activeElement).toBe(el("a3"));
  });

  it("Cmd+Shift+Left/Right is left for the MonthNavigator (returns false)", () => {
    el("a1").focus();
    expect(
      handleGridKeyNav(mod("ArrowLeft", el("a1"), { shiftKey: true }), grid),
    ).toBe(false);
    expect(document.activeElement).toBe(el("a1"));
  });
});
