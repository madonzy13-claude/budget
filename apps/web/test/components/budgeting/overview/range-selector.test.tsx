/**
 * range-selector.test.tsx — the range strip's step arrows (260802 request).
 *
 * The pills pick a window size; the arrows walk windows of that size. Forward
 * stops at today and says so by being disabled, and the all-time range has
 * nothing to walk.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "UTC",
}));

const link = { degraded: false, reason: "online" as string };
vi.mock("@/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({
    status: link.reason,
    degraded: link.degraded,
    reason: link.reason,
  }),
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

  it("keeps the arrows OUT of the scrolling pill row", () => {
    // Inside it they scrolled off the edge of a phone and were never seen.
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    const scroller = screen.getByTestId("overview-range-selector");
    expect(scroller).not.toContainElement(
      screen.getByTestId("range-step-back"),
    );
    expect(scroller).not.toContainElement(
      screen.getByTestId("range-step-forward"),
    );
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

  // 260805: the strip claimed pan-x for a horizontal swipe it does not have —
  // the pills fit — so a finger starting here could not scroll the page at all.
  it("leaves the page free to scroll when the pills fit", () => {
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    expect(
      screen.getByTestId("overview-range-selector").className,
    ).not.toContain("touch-pan-x");
  });
});

// 260806 (user): the cache only ever holds the range you were last looking at,
// so letting someone switch range while the network is gone would answer with
// data for a DIFFERENT window — silently wrong numbers, which is worse than not
// answering. The strip locks instead, and says why.
describe("Range selector — locked while the link is down", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());
  afterEach(() => {
    link.degraded = false;
    link.reason = "online";
  });

  it("leaves everything usable while the link is fine", () => {
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "3M" })).not.toBeDisabled();
    expect(screen.getByTestId("range-step-back")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "1M" })).not.toBeDisabled();
  });

  it("locks every preset when the device is offline", () => {
    link.degraded = true;
    link.reason = "offline";
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "3M" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "all" })).toBeDisabled();
  });

  it("locks the step arrows too — they change the window just as much", () => {
    link.degraded = true;
    link.reason = "offline";
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    expect(screen.getByTestId("range-step-back")).toBeDisabled();
  });

  it("locks when the server is unreachable, not just when the device is", () => {
    link.degraded = true;
    link.reason = "server-down";
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "3M" })).toBeDisabled();
  });

  // No sentence explaining the lock: the offline banner at the top of the page
  // already says it, and saying it twice was noise (user, 260806). The dimmed,
  // inert pills carry it on their own.
  it("explains itself by looking inert, not with a second banner", () => {
    link.degraded = true;
    link.reason = "offline";
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    expect(screen.queryByTestId("range-locked")).toBeNull();
    expect(screen.getByRole("button", { name: "3M" })).toBeDisabled();
  });

  it("does not fire a change from a locked preset", () => {
    link.degraded = true;
    link.reason = "offline";
    const onChange = vi.fn();
    render(<RangeSelector value={august} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "3M" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // The range that IS showing must stay legible — locking is not blanking.
  it("keeps the current range readable while locked", () => {
    link.degraded = true;
    link.reason = "offline";
    render(<RangeSelector value={august} onChange={vi.fn()} />);
    // The active preset is still on screen and still marked active — locked is
    // not the same as gone.
    const active = screen.getByRole("button", { name: "1M" });
    expect(active).toBeTruthy();
    expect(active.getAttribute("aria-pressed")).toBe("true");
  });
});
