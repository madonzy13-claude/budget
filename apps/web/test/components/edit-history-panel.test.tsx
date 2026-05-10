/**
 * edit-history-panel.test.tsx — Vitest+RTL tests for EditHistoryPanel.
 * TDD RED: fails until EditHistoryPanel is implemented.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let msg: Record<string, string> = {
        "transactions.history.editedLabel": "Edited {age}",
        "transactions.history.changedFields": "Changed: {fields}",
      };
      let s = msg[key] ?? key;
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(`{${k}}`, String(v));
      }
      return s;
    }
    const map: Record<string, string> = {
      "transactions.history.panelTitle": "Edit history",
      "transactions.history.originalLabel": "Original",
      "transactions.history.editedLabel": "Edited",
    };
    return map[key] ?? key;
  },
  useFormatter: () => ({
    relativeTime: (_date: Date) => "2 hours ago",
  }),
}));

// Mock fetch for history API
const mockFetch = vi.fn();
global.fetch = mockFetch;

const { EditHistoryPanel } = await import(
  "../../src/components/budgeting/edit-history-panel"
);

const mockChain = [
  {
    id: "original-001",
    kind: "EXPENSE",
    amountOrig: "5.00",
    currencyOrig: "USD",
    amountDefault: "4.60",
    currencyDefault: "EUR",
    transactionDate: "2026-05-08",
    note: "Coffee",
    correctsId: null,
    accountId: "acc-001",
    categoryId: null,
    transferGroupId: null,
    fxRate: "0.92",
    fxRateDate: "2026-05-08",
    fxProvider: "frankfurter",
  },
  {
    id: "correction-001",
    kind: "EXPENSE",
    amountOrig: "7.00",
    currencyOrig: "USD",
    amountDefault: "6.44",
    currencyDefault: "EUR",
    transactionDate: "2026-05-08",
    note: "Coffee",
    correctsId: "original-001",
    accountId: "acc-001",
    categoryId: null,
    transferGroupId: null,
    fxRate: "0.92",
    fxRateDate: "2026-05-08",
    fxProvider: "frankfurter",
  },
];

describe("EditHistoryPanel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders Edit history title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chain: mockChain }),
    });

    render(<EditHistoryPanel transactionId="original-001" open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Edit history/i)).toBeTruthy();
    });
  });

  it("renders 2 chain rows in correct order (original first)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chain: mockChain }),
    });

    render(<EditHistoryPanel transactionId="original-001" open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      // Both amounts should appear
      expect(screen.queryByText(/5\.00/)).toBeTruthy();
      expect(screen.queryByText(/7\.00/)).toBeTruthy();
    });
  });

  it("labels original row with Original badge", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chain: mockChain }),
    });

    render(<EditHistoryPanel transactionId="original-001" open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText("Original")).toBeTruthy();
    });
  });

  it("does not render when closed", () => {
    render(<EditHistoryPanel transactionId="original-001" open={false} onClose={vi.fn()} />);
    // Sheet is closed — should not show content
    expect(screen.queryByText(/Edit history/i)).toBeNull();
  });
});
