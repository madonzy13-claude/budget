/**
 * task-banner-row-lines.test.tsx — D-12: a RESERVE_TOPUP task with per-currency
 * lines states every currency; one without lines reads exactly as before.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-budget-data", () => ({ useCategories: () => ({ data: [] }) }));
vi.mock("@/hooks/use-month-param", () => ({ useMonthParam: () => ["2026-05", vi.fn()] }));
vi.mock("@/components/common/user-timezone-provider", () => ({ useUserTimezone: () => "Europe/Warsaw" }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      "bdp.tasks.title.RESERVE_TOPUP": "Top up reserve by {amount}",
      "bdp.tasks.title.RESERVE_TOPUP_withdraw": "Reserve has {amount} extra",
    };
    const tpl = dict[key] ?? key;
    return Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), tpl);
  },
}));

import { TaskBannerRow, type TaskSummary } from "@/components/budgeting/task-banner-row";
import { formatReserveLines } from "@/lib/reserve-lines-format";

const task = (payload: Record<string, unknown>): TaskSummary =>
  ({
    id: "t1",
    budget_id: "b1",
    kind: "RESERVE_TOPUP",
    status: "PENDING",
    payload,
    created_at: new Date().toISOString(),
  }) as unknown as TaskSummary;

const lines = [
  { currency: "PLN", shortfall_cents: "12000", direction: "TOPUP" },
  { currency: "EUR", shortfall_cents: "1500", direction: "TOPUP", equiv: { currency: "PLN", cents: "6400" } },
];

describe("Reserve task banner — per currency", () => {
  it("names every currency to top up", () => {
    render(<TaskBannerRow task={task({ shortfall_cents: "18400", direction: "TOPUP", currency: "PLN", lines })} budgetId="b1" />);
    const list = formatReserveLines(
      lines.map((l) => ({ currency: l.currency, cents: l.shortfall_cents, equiv: l.equiv })),
      "en",
    );
    expect(screen.getByText(`Top up reserve by ${list}`)).toBeTruthy();
  });

  it("a withdraw task names its currencies too", () => {
    render(
      <TaskBannerRow
        task={task({ shortfall_cents: "7000", direction: "WITHDRAW", currency: "PLN", lines: [{ currency: "PLN", shortfall_cents: "7000", direction: "WITHDRAW" }] })}
        budgetId="b1"
      />,
    );
    expect(screen.getByText(`Reserve has ${formatReserveLines([{ currency: "PLN", cents: "7000" }], "en")} extra`)).toBeTruthy();
  });
});
