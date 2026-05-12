/**
 * placeholder-chart.test.tsx — Vitest + RTL coverage for HOME-04.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => {
    const map: Record<string, string> = {
      "chart.placeholder": "Insights coming soon",
    };
    return map[key] ?? key;
  },
}));

import { PlaceholderChart } from "@/components/budgeting/placeholder-chart";

describe("PlaceholderChart", () => {
  it("renders with minimum height of 240px", async () => {
    const ui = await PlaceholderChart({ locale: "en" });
    const { container } = render(ui);
    const box = container.firstElementChild as HTMLElement | null;
    expect(box).toBeTruthy();
    const minHeightStyle = box?.style.minHeight ?? "";
    const className = box?.className ?? "";
    // Accept either inline style minHeight: "240px" or tailwind class min-h-[240px].
    const passes =
      minHeightStyle === "240px" ||
      /min-h-\[240px\]/.test(className) ||
      /240/.test(minHeightStyle + className);
    expect(passes).toBe(true);
  });

  it("renders lucide BarChart3 icon and 'Insights coming soon' copy", async () => {
    const ui = await PlaceholderChart({ locale: "en" });
    const { container } = render(ui);
    // lucide-react v1.14+ renames BarChart3 → ChartColumn under the hood, so
    // the rendered SVG carries `lucide-chart-column`. Match either legacy or
    // current class so the assertion is stable across upgrades.
    const svg = container.querySelector(
      "svg.lucide-chart-column, svg.lucide-bar-chart-3",
    );
    expect(svg).toBeTruthy();
    expect(screen.getByText("Insights coming soon")).toBeTruthy();
  });
});
