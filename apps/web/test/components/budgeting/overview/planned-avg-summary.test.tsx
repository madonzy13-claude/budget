/**
 * planned-avg-summary.test.tsx — the figures under the by-category bars (260805).
 *
 * The bars say WHICH categories drift. They never say what the month comes to,
 * so a page of red bars could be 200 zł or 2,000. This row answers that: what a
 * typical month plans, what it spends, and the gap between them.
 */
import { describe, it, expect, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations:
    (ns: string) => (key: string, vars?: Record<string, unknown>) => {
      const path = `${ns}.${key}`.split(".");
      let node: unknown = messages;
      for (const part of path) {
        node = (node as Record<string, unknown> | undefined)?.[part];
        if (node === undefined)
          throw new Error(`missing i18n key: ${path.join(".")}`);
      }
      return vars ? `${key}:${Object.values(vars).join(",")}` : key;
    },
  useLocale: () => "en",
}));

const { PlannedAvgSummary } =
  await import("@/components/budgeting/overview/planned-avg-summary");

const rows = [
  { planned_avg_cents: "100000", real_avg_cents: "130000" },
  { planned_avg_cents: "50000", real_avg_cents: "50000" },
];

const view = (props: Record<string, unknown> = {}) =>
  render(
    <PlannedAvgSummary
      rows={rows}
      format={(c: number) => `${Math.round(c / 100)} zl`}
      {...props}
    />,
  );

describe("PlannedAvgSummary", () => {
  it("adds the categories into one average month", () => {
    view();
    expect(screen.getByTestId("planned-avg-planned").textContent).toContain(
      "1500 zl",
    );
    expect(screen.getByTestId("planned-avg-spent").textContent).toContain(
      "1800 zl",
    );
  });

  it("reads an overspend as a positive gap, like the bars do", () => {
    view();
    const diff = screen.getByTestId("planned-avg-difference").textContent ?? "";
    expect(diff).toContain("+300 zl");
    expect(diff).toContain("20.0%");
  });

  it("reads an underspend as a negative gap", () => {
    view({
      rows: [{ planned_avg_cents: "100000", real_avg_cents: "60000" }],
    });
    expect(screen.getByTestId("planned-avg-difference").textContent).toContain(
      "−400 zl",
    );
  });

  // Same band as the bars above it: distance from plan, either direction.
  it("bands the gap by distance from plan, not by direction", () => {
    view({ rows: [{ planned_avg_cents: "100000", real_avg_cents: "40000" }] });
    const el = screen.getByTestId("planned-avg-difference");
    expect(el.outerHTML).toContain("--trading-down");
  });

  it("says nothing when there is nothing to average", () => {
    view({ rows: [] });
    expect(screen.queryByTestId("planned-avg-summary")).toBeNull();
  });
});
