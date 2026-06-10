import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
const mockPathname = "/en/budgets/abc123/spendings";
let mockSearchParamsValue = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

// Mock temporal-polyfill to return a fixed "today"
vi.mock("temporal-polyfill", () => {
  const PlainYearMonth = class {
    constructor(
      public year: number,
      public month: number,
    ) {}
    static from(s: string) {
      const [y, m] = s.split("-").map(Number);
      return new PlainYearMonth(y, m);
    }
    static compare(
      a: InstanceType<typeof PlainYearMonth>,
      b: InstanceType<typeof PlainYearMonth>,
    ) {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    }
    toString() {
      return `${this.year}-${String(this.month).padStart(2, "0")}`;
    }
    subtract({ months }: { months: number }) {
      let m = this.month - months;
      let y = this.year;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      return new PlainYearMonth(y, m);
    }
    add({ months }: { months: number }) {
      let m = this.month + months;
      let y = this.year;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      return new PlainYearMonth(y, m);
    }
    toPlainYearMonth() {
      return this;
    }
    toPlainDate({ day }: { day: number }) {
      return {
        toString: () =>
          `${this.year}-${String(this.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        toPlainYearMonth: () => this,
      };
    }
    get daysInMonth() {
      return 30;
    }
  };

  const PlainDate = class {
    year: number;
    month: number;
    day: number;
    constructor(y: number, m: number, d: number) {
      this.year = y;
      this.month = m;
      this.day = d;
    }
    toPlainYearMonth() {
      return new PlainYearMonth(this.year, this.month);
    }
    toString() {
      return `${this.year}-${String(this.month).padStart(2, "0")}-${String(this.day).padStart(2, "0")}`;
    }
  };

  return {
    Temporal: {
      PlainYearMonth,
      PlainDate,
      Now: {
        plainDateISO: (_tz?: string) => new PlainDate(2026, 5, 13),
      },
    },
  };
});

import { useMonthParam } from "../../src/hooks/use-month-param";

describe("useMonthParam", () => {
  beforeEach(() => {
    mockSearchParamsValue = "";
    mockPush.mockClear();
  });

  it("defaults to current month when ?month absent", () => {
    const { result } = renderHook(() => useMonthParam());
    expect(result.current.monthStr).toBe("2026-05");
  });

  it("returns Temporal.PlainYearMonth for valid YYYY-MM", () => {
    mockSearchParamsValue = "month=2025-03";
    const { result } = renderHook(() => useMonthParam());
    expect(result.current.monthStr).toBe("2025-03");
    expect(result.current.month.year).toBe(2025);
    expect(result.current.month.month).toBe(3);
  });

  it("falls back to current when ?month is malformed", () => {
    mockSearchParamsValue = "month=not-a-date";
    const { result } = renderHook(() => useMonthParam());
    expect(result.current.monthStr).toBe("2026-05");
  });

  it("prev() decrements month", () => {
    mockSearchParamsValue = "month=2026-05";
    const { result } = renderHook(() => useMonthParam());
    act(() => result.current.prev());
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=2026-04"),
    );
  });

  it("next() increments month", () => {
    // Start from a past month — next() is intentionally blocked on the current
    // month (no future navigation), so increment must be exercised from < now.
    mockSearchParamsValue = "month=2026-04";
    const { result } = renderHook(() => useMonthParam());
    act(() => result.current.next());
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=2026-05"),
    );
  });

  it("next() is a no-op on the current month (no future navigation)", () => {
    mockSearchParamsValue = "month=2026-05";
    const { result } = renderHook(() => useMonthParam());
    act(() => result.current.next());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("today() sets to current month", () => {
    mockSearchParamsValue = "month=2024-01";
    const { result } = renderHook(() => useMonthParam());
    act(() => result.current.today());
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=2026-05"),
    );
  });

  it("isCurrentMonth is true when on current month", () => {
    mockSearchParamsValue = "month=2026-05";
    const { result } = renderHook(() => useMonthParam());
    expect(result.current.isCurrentMonth).toBe(true);
  });

  it("isCurrentMonth is false when on different month", () => {
    mockSearchParamsValue = "month=2025-01";
    const { result } = renderHook(() => useMonthParam());
    expect(result.current.isCurrentMonth).toBe(false);
  });
});
