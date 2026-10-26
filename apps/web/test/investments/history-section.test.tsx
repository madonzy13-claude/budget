/**
 * history-section.test.tsx — Phase 13 History in the edit sheet (D-05, D-06,
 * D-09): newest first, kind labels, realized note, counterparty, Automatic
 * tag on Start; delete = full undo behind a confirm; refusals toast.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params
      ? `${key}(${Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join(",")})`
      : key,
  useLocale: () => "en",
}));
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/budget-fetch", () => ({ clientApiFetch: fetchMock }));
const writeMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...a: unknown[]) => writeMock(...a),
  isOfflineWriteError: () => false,
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));

import { HistorySection } from "../../src/components/budgeting/wallets-tab/history-section";

const entries = [
  {
    id: "e3",
    kind: "convert_out",
    effectiveDate: "2026-10-24",
    amountCents: "6600000",
    amountCurrency: "PLN",
    qtyDelta: null,
    realizedBudgetCents: "2818750",
    budgetCurrency: "PLN",
    transferId: "t1",
    counterpartyName: "Erste",
    createdAt: "2026-10-24T10:00:00Z",
  },
  {
    id: "e1",
    kind: "start",
    effectiveDate: "2024-01-10",
    amountCents: "5500000",
    amountCurrency: "PLN",
    qtyDelta: null,
    realizedBudgetCents: null,
    budgetCurrency: null,
    transferId: null,
    counterpartyName: null,
    createdAt: "2026-10-25T00:00:00Z",
  },
];

function mount(list = entries) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ entries: list }), { status: 200 }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <HistorySection budgetId="b1" holdingId="h1" />
    </QueryClientProvider>,
  );
  return { spy };
}

beforeEach(() => {
  fetchMock.mockReset();
  writeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("History section", () => {
  it("is collapsed by default with a count, rows newest first", async () => {
    mount();
    const root = await screen.findByTestId("history-section");
    expect(root.hasAttribute("open")).toBe(false);
    expect(
      await screen.findByText("history.title(count=2)"),
    ).toBeInTheDocument();
    const kinds = [...root.querySelectorAll("[data-history-kind]")].map((e) =>
      e.getAttribute("data-history-kind"),
    );
    expect(kinds).toEqual(["convert_out", "start"]);
  });

  it("shows counterparty, realized note and the Automatic tag", async () => {
    mount();
    expect(
      await screen.findByText("history.toHolding(name=Erste)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("history-realized-e3")).toHaveTextContent(
      "history.realizedNote(amount=+28,187.50)",
    );
    expect(screen.getByText("history.automatic")).toBeInTheDocument();
  });

  it("deleting a conversion explains both sides, then undoes it", async () => {
    writeMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, undone: 2 }), { status: 200 }),
    );
    const { spy } = mount();
    fireEvent.click(await screen.findByTestId("history-delete-e3"));
    expect(
      await screen.findByText("history.deleteConvBody(other=Erste)"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("history-delete-confirm"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(writeMock.mock.calls[0]![0]).toBe(
      "/budgets/b1/investments/history/e3",
    );
    expect((writeMock.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("history.toastDeleted"),
    );
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["budget", "b1", "investments"],
    });
  });

  it("a normal entry uses the full-undo copy", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("history-delete-e1"));
    expect(
      await screen.findByText(
        /^history\.deleteBody\(kind=history\.start,date=/,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["undo_later_first", "history.errUndoLaterFirst"],
    ["would_empty_holding", "history.errWouldEmpty"],
  ])("refusal %s toasts %s", async (code, copy) => {
    writeMock.mockResolvedValue(
      new Response(JSON.stringify({ error: code }), { status: 422 }),
    );
    mount();
    fireEvent.click(await screen.findByTestId("history-delete-e1"));
    fireEvent.click(await screen.findByTestId("history-delete-confirm"));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(copy));
  });

  it("empty history explains what will show up", async () => {
    mount([]);
    expect(await screen.findByText("history.emptyTitle")).toBeInTheDocument();
    expect(screen.getByText("history.emptyBody")).toBeInTheDocument();
  });
});
