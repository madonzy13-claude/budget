/**
 * range-selector.test.tsx — the range strip's step arrows (260802 request).
 *
 * The pills pick a window size; the arrows walk windows of that size. Forward
 * stops at today and says so by being disabled, and the all-time range has
 * nothing to walk.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "UTC",
}));

const { RangeSelector } =
  await import("@/components/budgeting/overview/range-selector");

const august = {
  preset: "thisMonth" as const,
  from: "2026-08-01",
  to: "2026-08-02",
};

describe("Range selector arrows", () => {
  // The component reads the real clock, so pin it: "today" is what decides
  // whether stepping forward is possible at all.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("steps the window back a whole month", () => {
    const onChange = vi.fn();
    render(<RangeSelector value={august} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("range-step-back"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: "2026-07-01", to: "2026-07-31" }),
    );
  });

  it("disables the forward arrow once the window reaches today", () => {
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    expect(screen.getByTestId("range-step-forward")).toBeDisabled();
    expect(screen.getByTestId("range-step-back")).not.toBeDisabled();
  });

  it("offers the forward arrow while the window ends in the past", () => {
    render(
      <RangeSelector
        value={{ preset: "thisMonth", from: "2026-07-01", to: "2026-07-31" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("range-step-forward")).not.toBeDisabled();
  });

  it("has nothing to step for the all-time range", () => {
    render(
      <RangeSelector
        value={{ preset: "all", from: "2021-08-02", to: "2026-08-02" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("range-step-back")).toBeDisabled();
    expect(screen.getByTestId("range-step-forward")).toBeDisabled();
  });
});
