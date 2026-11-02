/**
 * 261102 (user): every wallet's currency dropdown was a fixed 224px. The column
 * is now as wide as the longest SELECTED label in the list (code + name +
 * symbol), measured — so every row lines up and none is wider than needed.
 */
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { useFitCurrencyColumn } from "@/hooks/use-fit-currency-column";

function label(widths: number[]) {
  return (
    <span data-ccy-label>
      {widths.map((w, i) => (
        <span
          key={i}
          ref={(el) => {
            if (el) Object.defineProperty(el, "scrollWidth", { value: w });
          }}
        />
      ))}
    </span>
  );
}

function List({ rows }: { rows: number[][] }) {
  const ref = useRef<HTMLDivElement>(null);
  useFitCurrencyColumn(ref);
  return (
    <div ref={ref} data-testid="list">
      {rows.map((r, i) => (
        <div key={i}>{label(r)}</div>
      ))}
    </div>
  );
}

describe("useFitCurrencyColumn", () => {
  it("sizes the column to the widest selected label + the field's chrome", async () => {
    // "USD" 30 + "US Dollar" 70 + "$" 8, two 8px gaps → 124; "PLN Polish złoty zł" → 160.
    const { getByTestId } = render(
      <List
        rows={[
          [30, 70, 8],
          [30, 106, 8],
        ]}
      />,
    );
    await waitFor(() =>
      expect(getByTestId("list").style.getPropertyValue("--ccy-w")).toBe(
        `${30 + 106 + 8 + 16 + CHROME}px`,
      ),
    );
  });

  it("follows a newly picked currency", async () => {
    const { getByTestId, rerender } = render(<List rows={[[30, 70, 8]]} />);
    rerender(
      <List
        rows={[
          [30, 70, 8],
          [30, 150, 8],
        ]}
      />,
    );
    await waitFor(() =>
      expect(getByTestId("list").style.getPropertyValue("--ccy-w")).toBe(
        `${30 + 150 + 8 + 16 + CHROME}px`,
      ),
    );
  });
});

// Trigger padding 24 + gap 8 + chevron 16 + border 2.
const CHROME = 50;
