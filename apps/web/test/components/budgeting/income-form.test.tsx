/**
 * income-form.test.tsx — the Income form submits name + amount + currency +
 * discriminated cadence to the budget-scoped route (r32).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => () => {},
}));

import { IncomeForm } from "@/components/budgeting/income-form";

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  );
}

const fetchMock = vi.fn(async () => ({ ok: true }) as Response);

beforeEach(() => fetchMock.mockClear());

function bodyOf(call: number) {
  const [, init] = fetchMock.mock.calls[call] as [string, { body: string }];
  return JSON.parse(init.body);
}
function urlOf(call: number) {
  return fetchMock.mock.calls[call][0] as string;
}

describe("IncomeForm", () => {
  it("create: POSTs name + amount + currency + MONTHLY cadence to the budget route", async () => {
    wrap(
      <IncomeForm
        open
        onOpenChange={() => {}}
        mode="create"
        budgetId="b1"
        defaultCurrency="USD"
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    fireEvent.change(document.getElementById("income-name") as HTMLElement, {
      target: { value: "Salary" },
    });
    fireEvent.change(document.getElementById("income-amount") as HTMLElement, {
      target: { value: "5000" },
    });
    fireEvent.change(document.getElementById("income-anchor") as HTMLElement, {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByTestId("income-save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(urlOf(0)).toBe("/api/budgets/b1/incomes");
    const body = bodyOf(0);
    expect(body).toMatchObject({
      name: "Salary",
      amount: "5000",
      currency: "USD",
      cadence: "MONTHLY",
      cadence_anchor: 10,
    });
  });

  it("weekly cadence sends weekly_dow (no anchor)", async () => {
    wrap(
      <IncomeForm
        open
        onOpenChange={() => {}}
        mode="create"
        budgetId="b1"
        defaultCurrency="EUR"
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    fireEvent.change(document.getElementById("income-name") as HTMLElement, {
      target: { value: "Freelance" },
    });
    fireEvent.change(document.getElementById("income-amount") as HTMLElement, {
      target: { value: "800" },
    });
    fireEvent.click(screen.getByTestId("income-cadence-WEEKLY"));
    fireEvent.click(screen.getByTestId("income-save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = bodyOf(0);
    expect(body.cadence).toBe("WEEKLY");
    expect(body).toHaveProperty("weekly_dow");
    expect(body).not.toHaveProperty("cadence_anchor");
  });

  it("edit: PATCHes the full record to /:id", async () => {
    wrap(
      <IncomeForm
        open
        onOpenChange={() => {}}
        mode="edit"
        budgetId="b1"
        initialValues={{
          incomeId: "inc-1",
          name: "Rent income",
          amount: "1200.0000",
          currency: "USD",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          yearlyMonth: null,
        }}
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("income-save"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe("/api/budgets/b1/incomes/inc-1");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    // amount prefill normalized from "1200.0000" → "1200".
    expect(body).toMatchObject({
      name: "Rent income",
      amount: "1200",
      cadence: "MONTHLY",
    });
  });
});
