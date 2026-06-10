/**
 * month-navigator.test.tsx — Vitest+RTL tests for MonthNavigator component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MonthNavigator } from "../../../src/components/budgeting/spendings-grid/month-navigator";

const mockPush = vi.fn();
let mockSearchParamsValue = "month=2026-05";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/budgets/abc/spendings",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

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
    get daysInMonth() {
      return 30;
    }
  };
  return {
    Temporal: {
      PlainYearMonth,
      Now: {
        plainDateISO: () => ({
          toPlainYearMonth: () => new PlainYearMonth(2026, 5),
        }),
      },
    },
  };
});

describe("MonthNavigator", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSearchParamsValue = "month=2026-05";
  });

  it("renders data-testid=month-navigator-label", () => {
    render(<MonthNavigator month="2026-05" />);
    expect(screen.getByTestId("month-navigator-label")).toBeTruthy();
  });

  it("renders data-testid=month-navigator-prev", () => {
    render(<MonthNavigator month="2026-05" />);
    expect(screen.getByTestId("month-navigator-prev")).toBeTruthy();
  });

  it("renders data-testid=month-navigator-next", () => {
    render(<MonthNavigator month="2026-05" />);
    expect(screen.getByTestId("month-navigator-next")).toBeTruthy();
  });

  it("clicking prev button calls router.push with decremented month", () => {
    render(<MonthNavigator month="2026-05" />);
    fireEvent.click(screen.getByTestId("month-navigator-prev"));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=2026-04"),
    );
  });

  it("clicking next button calls router.push with incremented month", () => {
    // next() is blocked on the current month (no future nav), so start in the past.
    mockSearchParamsValue = "month=2026-04";
    render(<MonthNavigator month="2026-04" />);
    fireEvent.click(screen.getByTestId("month-navigator-next"));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=2026-05"),
    );
  });

  it("clicking next button is a no-op on the current month (no future nav)", () => {
    render(<MonthNavigator month="2026-05" />);
    fireEvent.click(screen.getByTestId("month-navigator-next"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("plain ArrowLeft does NOTHING (D-PH4-Q3)", () => {
    render(<MonthNavigator month="2026-05" />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("Cmd+ArrowLeft navigates prev (D-PH4-Q3)", () => {
    render(<MonthNavigator month="2026-05" />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          metaKey: true,
          bubbles: true,
        }),
      );
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=2026-04"),
    );
  });

  it("Cmd+ArrowRight navigates next", () => {
    // Past month so next() is not blocked by the no-future-navigation guard.
    mockSearchParamsValue = "month=2026-04";
    render(<MonthNavigator month="2026-04" />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          metaKey: true,
          bubbles: true,
        }),
      );
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=2026-05"),
    );
  });

  it("Today button absent when on current month", () => {
    render(<MonthNavigator month="2026-05" />);
    const todayBtn = document.querySelector(
      '[data-testid="month-navigator-today"]',
    );
    expect(todayBtn).toBeNull();
  });
});
