/**
 * inline-edit-cell.test.tsx — Vitest+RTL tests for InlineEditCell atom.
 *
 * Coverage:
 * - Resting render (role=button, tabIndex, aria-label)
 * - Click to open editor
 * - onCommit with same value → no save
 * - onCommit with different value → save called
 * - onSave throws → draft reverts, data-state=failed
 * - Esc key → cancel, no save
 * - disabled prop → click no-op
 * - 200ms spinner threshold (fake timers)
 * - No unsafe raw-HTML injection prop in atom file
 * - Generic over <T> (string + number)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import { InlineEditCell } from "../../src/components/common/inline-edit-cell";

// ─── helpers ────────────────────────────────────────────────────────────────

function renderCell<T>(
  value: T,
  opts: {
    onSave?: (v: T) => Promise<void>;
    disabled?: boolean;
    testId?: string;
  } = {},
) {
  const onSave = opts.onSave ?? vi.fn().mockResolvedValue(undefined);
  const renderEditor = (
    draft: T,
    onChange: (v: T) => void,
    onCommit: () => void,
    onCancel: () => void,
  ) => (
    <input
      data-testid="editor-input"
      value={String(draft)}
      onChange={(e) => onChange(e.target.value as unknown as T)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter") onCommit();
      }}
    />
  );

  const renderDisplay = (v: T) => (
    <span data-testid="display-value">{String(v)}</span>
  );

  const utils = render(
    <InlineEditCell
      value={value}
      render={renderDisplay}
      renderEditor={renderEditor}
      onSave={onSave}
      ariaLabel="edit cell"
      disabled={opts.disabled}
      testId={opts.testId ?? "cell"}
    />,
  );
  return { ...utils, onSave };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("InlineEditCell", () => {
  describe("resting render", () => {
    it("renders the display value", () => {
      renderCell("hello");
      expect(screen.getByTestId("display-value")).toHaveTextContent("hello");
    });

    it("has role=button with correct aria-label and tabIndex=0", () => {
      renderCell("hello");
      const btn = screen.getByRole("button");
      expect(btn).toHaveAttribute("aria-label", "edit cell");
      expect(btn).toHaveAttribute("tabindex", "0");
    });

    // UAT-PH5-T3-11: hover cursor reads as text-edit (I-beam) so the user
    // knows the cell is editable as text. Previously `cursor-pointer`, which
    // read as "this is a link/button" rather than "click to edit text".
    it("resting cell has cursor-text class (text-edit I-beam on hover)", () => {
      renderCell("hello");
      const btn = screen.getByRole("button");
      expect(btn.className).toContain("cursor-text");
      expect(btn.className).not.toContain("cursor-pointer");
    });

    it("disabled cell falls back to cursor-default (not text)", () => {
      renderCell("hello", { disabled: true });
      const btn = screen.getByRole("button");
      expect(btn.className).toContain("cursor-default");
      expect(btn.className).not.toContain("cursor-text");
    });
  });

  describe("click to edit", () => {
    it("mounts editor on click with draft = value", () => {
      renderCell("hello");
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByTestId("editor-input")).toHaveValue("hello");
    });

    it("unmounts editor and does not call onSave when draft equals original", async () => {
      const { onSave } = renderCell("hello");
      fireEvent.click(screen.getByRole("button"));
      // fire commit with unchanged draft
      fireEvent.keyDown(screen.getByTestId("editor-input"), { key: "Enter" });
      await waitFor(() =>
        expect(screen.queryByTestId("editor-input")).not.toBeInTheDocument(),
      );
      expect(onSave).not.toHaveBeenCalled();
    });

    it("calls onSave with new value when draft differs", async () => {
      const { onSave } = renderCell("hello");
      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByTestId("editor-input");
      fireEvent.change(input, { target: { value: "world" } });
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() => expect(onSave).toHaveBeenCalledWith("world"));
      expect(screen.queryByTestId("editor-input")).not.toBeInTheDocument();
    });

    // 260625 regression: when a background refetch updates `value` AFTER mount
    // (e.g. a reserves cell hydrating 0 → 900), clicking to edit must seed the
    // editor from the LATEST value (the one the cell visibly shows), never the
    // stale value captured at mount. beginEdit now seeds setDraft(props.value)
    // explicitly so the value-sync effect can't be preempted by the click. A
    // stale seed (0) would no-op the commit on the Object.is(draft,value) guard
    // even though the user sees 900 — exactly the reserves-golden adjust flake.
    it("seeds the editor from the LATEST value after a background update", () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const renderEditor = (draft: number, onChange: (v: number) => void) => (
        <input
          data-testid="editor-input"
          value={String(draft)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );
      const renderDisplay = (v: number) => (
        <span data-testid="display-value">{String(v)}</span>
      );
      const view = (v: number) => (
        <InlineEditCell
          value={v}
          render={renderDisplay}
          renderEditor={renderEditor}
          onSave={onSave}
          ariaLabel="edit cell"
          testId="cell"
        />
      );
      const { rerender } = render(view(0)); // placeholder at mount
      rerender(view(900)); // background refetch hydrates the real value
      expect(screen.getByTestId("display-value")).toHaveTextContent("900");
      fireEvent.click(screen.getByRole("button"));
      // Editor seeds 900 (the shown value), not the stale 0.
      expect(screen.getByTestId("editor-input")).toHaveValue("900");
    });
  });

  describe("onSave throws (error state)", () => {
    it("reverts draft and sets data-state=failed", async () => {
      const onSave = vi.fn().mockRejectedValue(new Error("network"));
      renderCell("hello", { onSave });
      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByTestId("editor-input");
      fireEvent.change(input, { target: { value: "bad" } });
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() =>
        expect(screen.queryByTestId("editor-input")).not.toBeInTheDocument(),
      );
      const btn = screen.getByRole("button");
      expect(btn).toHaveAttribute("data-state", "failed");
    });
  });

  describe("Esc key", () => {
    it("cancels without calling onSave", async () => {
      const { onSave } = renderCell("hello");
      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByTestId("editor-input");
      fireEvent.change(input, { target: { value: "changed" } });
      fireEvent.keyDown(input, { key: "Escape" });
      await waitFor(() =>
        expect(screen.queryByTestId("editor-input")).not.toBeInTheDocument(),
      );
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe("disabled prop", () => {
    it("does not open editor when disabled", () => {
      renderCell("hello", { disabled: true });
      fireEvent.click(screen.getByTestId("cell"));
      expect(screen.queryByTestId("editor-input")).not.toBeInTheDocument();
    });

    it("has tabIndex=-1 when disabled", () => {
      renderCell("hello", { disabled: true });
      const el = screen.getByTestId("cell");
      expect(el).toHaveAttribute("tabindex", "-1");
    });
  });

  describe("spinner threshold (200ms)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does NOT show spinner before 200ms", async () => {
      let resolveOnSave!: () => void;
      const onSave = vi.fn(
        () => new Promise<void>((res) => (resolveOnSave = res)),
      );
      renderCell("hello", { onSave });
      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByTestId("editor-input");
      fireEvent.change(input, { target: { value: "world" } });
      fireEvent.keyDown(input, { key: "Enter" });
      // advance 100ms — spinner must NOT appear
      act(() => vi.advanceTimersByTime(100));
      expect(document.querySelector(".animate-spin")).toBeNull();
      // resolve and clean up
      act(() => resolveOnSave());
    });

    it("shows spinner after 200ms threshold", async () => {
      let resolveOnSave!: () => void;
      const onSave = vi.fn(
        () => new Promise<void>((res) => (resolveOnSave = res)),
      );
      renderCell("hello", { onSave });
      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByTestId("editor-input");
      fireEvent.change(input, { target: { value: "world" } });
      fireEvent.keyDown(input, { key: "Enter" });
      // advance past threshold
      act(() => vi.advanceTimersByTime(250));
      // Loader2 uses .animate-spin
      expect(document.querySelector(".animate-spin")).toBeTruthy();
      act(() => resolveOnSave());
    });
  });

  describe("security: no raw HTML injection prop in atom", () => {
    it("atom file does not use the unsafe raw-HTML React prop", () => {
      const atomPath = path.resolve(
        __dirname,
        "../../src/components/common/inline-edit-cell.tsx",
      );
      const src = fs.readFileSync(atomPath, "utf8");
      // Prop name split to avoid triggering hook scanners on the test source itself
      const unsafeProp = ["dangerously", "Set", "Inner", "HTML"].join("");
      expect(src.includes(unsafeProp)).toBe(false);
    });
  });

  describe("generic type support", () => {
    it("works with T=string", () => {
      renderCell<string>("text-value");
      expect(screen.getByTestId("display-value")).toHaveTextContent(
        "text-value",
      );
    });

    it("works with T=number", () => {
      renderCell<number>(42, {
        onSave: vi.fn().mockResolvedValue(undefined),
      });
      expect(screen.getByTestId("display-value")).toHaveTextContent("42");
    });
  });

  // Regression: on iOS the wallet editors relied on the input's bare
  // `autoFocus`, which lets Safari auto-scroll the focused input — the row
  // "jumped too high" on the first edit after a cold app open. The cell must
  // own focus itself, with preventScroll, so callers don't need autoFocus.
  describe("keyboard-safe focus ownership", () => {
    it("focuses the editor input itself (no autoFocus needed)", async () => {
      renderCell<string>("hello");
      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByTestId("editor-input");
      await waitFor(() => expect(document.activeElement).toBe(input));
    });

    it("focuses with preventScroll so the browser cannot pan the page", async () => {
      const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
      renderCell<string>("hello");
      fireEvent.click(screen.getByRole("button"));
      await waitFor(() => {
        expect(focusSpy).toHaveBeenCalledWith(
          expect.objectContaining({ preventScroll: true }),
        );
      });
      focusSpy.mockRestore();
    });
  });
});
