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
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));
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

beforeEach(() => {
  fetchMock.mockClear();
  toastError.mockClear();
});

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

  it("sends a COMMA amount as the dot decimal the API accepts", async () => {
    // /incomes validates `^\d+(\.\d{1,4})?$`, so a comma keyboard ("73,8" —
    // the Polish layout's decimal key) was rejected and the save failed. Same
    // bug the user hit on the scheduled-payment form (260803).
    wrap(
      <IncomeForm
        open
        onOpenChange={() => {}}
        mode="create"
        budgetId="b1"
        defaultCurrency="PLN"
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    fireEvent.change(document.getElementById("income-name") as HTMLElement, {
      target: { value: "Salary" },
    });
    fireEvent.change(document.getElementById("income-amount") as HTMLElement, {
      target: { value: "73,8" },
    });
    fireEvent.click(screen.getByTestId("income-save"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).amount).toBe("73.8");
  });

  it("says so on a nonsense amount instead of a doomed round trip", async () => {
    wrap(
      <IncomeForm
        open
        onOpenChange={() => {}}
        mode="create"
        budgetId="b1"
        defaultCurrency="PLN"
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    fireEvent.change(document.getElementById("income-name") as HTMLElement, {
      target: { value: "Salary" },
    });
    fireEvent.change(document.getElementById("income-amount") as HTMLElement, {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByTestId("income-save"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
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

describe("IncomeForm — an income that arrives once", () => {
  const renderOnce = () =>
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

  it("offers it alongside the rhythms", () => {
    renderOnce();
    expect(screen.getByTestId("income-cadence-ONCE")).toBeTruthy();
  });

  it("asks WHEN, and only then", () => {
    // A bonus has no pay-day pattern; the date is the whole answer.
    renderOnce();
    expect(document.getElementById("income-once-date")).toBeNull();
    fireEvent.click(screen.getByTestId("income-cadence-ONCE"));
    expect(document.getElementById("income-once-date")).toBeTruthy();
  });

  it("hides the day / weekday / month selectors", () => {
    renderOnce();
    fireEvent.click(screen.getByTestId("income-cadence-ONCE"));
    expect(document.getElementById("income-anchor")).toBeNull();
    expect(document.getElementById("income-dow")).toBeNull();
  });

  it("refuses to offer a date in the past", () => {
    // Income that already arrived is a transaction, not a plan — the native
    // picker should not even present those days (user, 260807).
    renderOnce();
    fireEvent.click(screen.getByTestId("income-cadence-ONCE"));
    const input = document.getElementById("income-once-date") as HTMLInputElement;
    const today = new Date().toISOString().slice(0, 10);
    expect(input.getAttribute("min")).toBe(today);
  });

  it("sends ONCE with its date and no anchor", async () => {
    renderOnce();
    fireEvent.change(document.getElementById("income-name") as HTMLElement, {
      target: { value: "Bonus" },
    });
    fireEvent.change(document.getElementById("income-amount") as HTMLElement, {
      target: { value: "9000" },
    });
    fireEvent.click(screen.getByTestId("income-cadence-ONCE"));
    fireEvent.change(
      document.getElementById("income-once-date") as HTMLElement,
      { target: { value: "2027-03-09" } },
    );
    fireEvent.click(screen.getByTestId("income-save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = bodyOf(fetchMock.mock.calls.length - 1);
    expect(body).toMatchObject({
      name: "Bonus",
      cadence: "ONCE",
      once_date: "2027-03-09",
    });
    expect(body.cadence_anchor).toBeUndefined();
    expect(body.weekly_dow).toBeUndefined();
  });
});

describe("IncomeForm — the frequency row on a phone", () => {
  it("lays the four choices out in a grid, not one clipped row", () => {
    // Four buttons in a single flex row ran "Yearly" off the right edge of a
    // phone (user screenshot, 260807). A 2×2 grid fits; it opens out to a
    // single row once there is width for it.
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
    const row = screen.getByTestId("income-cadence-ONCE").parentElement!;
    expect(row.className).toContain("grid");
    expect(row.className).toContain("grid-cols-2");
    expect(row.className).not.toMatch(/\bflex\b/);
  });
});
