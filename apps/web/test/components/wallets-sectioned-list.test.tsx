/**
 * wallets-sectioned-list.test.tsx — Vitest+RTL tests for WalletsSectionedList.
 *
 * Coverage:
 * - Renders 3 sections (SPENDINGS, CUSHION, RESERVE) when wallets are provided
 * - Each section has its DashedAddButton
 * - Wallets appear in the correct sections
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletsSectionedList } from "../../src/components/budgeting/wallets-tab/wallets-sectioned-list";
import type { WalletDto } from "../../src/hooks/use-wallets";

// Mock next-intl — useTranslations returns a function that translates relative keys
// Components call: useTranslations("bdp.tab.wallets") → t("section.spendings")
vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        // Relative keys (as used by component internals)
        "section.spendings": "Spendings wallets",
        "section.cushion": "Cushion wallets",
        "section.reserve": "Reserve wallets",
        "section.possession": "Possessions",
        "section.other": "Other assets",
        "add.spendings": "Add spendings wallet",
        "add.cushion": "Add cushion wallet",
        "add.reserve": "Add reserve wallet",
        "add.possession": "Add possession",
        "add.other": "Add other asset",
        "row.namePlaceholder": "Wallet name",
        "row.nameAria": "Wallet name. Click to edit.",
        "row.currencyAria": "Currency. Click to edit.",
        "row.currencyReadOnlyAria":
          "Currency {ccy}. Reserve wallets must match budget currency.",
        "row.amountAria": "Amount. Click to edit.",
        "row.dragHandleAria": "Drag to move {name} to another section.",
        "row.trashAria": "Delete wallet {name}.",
        "confirm.delete.title": "Delete wallet '{name}'?",
        "confirm.delete.body": "This can't be undone here.",
        "confirm.delete.cta": "Delete",
        "confirm.delete.cancel": "Cancel",
      };
      let s = map[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
  useLocale: () => "en",
}));

// 260803: the drop handler is the only thing that moves a wallet between
// sections, and jsdom cannot drive a real dnd-kit drag. Capture the callback
// DndContext receives and fire it directly.
const dnd = vi.hoisted(() => ({
  onDragEnd: null as ((e: unknown) => void) | null,
}));

// Mock @dnd-kit/core
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (e: unknown) => void;
  }) => (
    <div
      data-testid="dnd-context"
      data-on-drag-end={String(!!(dnd.onDragEnd = onDragEnd))}
    >
      {children}
    </div>
  ),
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: vi.fn(),
    isOver: false,
    id,
  }),
  useDraggable: ({ id }: { id: string }) => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    id,
  }),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  DragOverlay: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
}));

// The investments section drags in its own data hooks; a stub is enough to
// assert where the possession/other sections sit relative to it.
vi.mock(
  "../../src/components/budgeting/wallets-tab/investments-section",
  () => ({
    InvestmentsSection: () => <div data-testid="investments-section" />,
  }),
);

// Mock clientApiFetch (not called on initial render)
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(),
}));

// PATCH /wallets/:id goes through the offline-write wrapper.
const mockWrite = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...a: unknown[]) => mockWrite(...a),
  isOfflineWriteError: () => false,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock CurrencyPicker
vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({ value }: { value: string }) => (
    <select data-testid="currency-picker" defaultValue={value}>
      <option value={value}>{value}</option>
    </select>
  ),
}));

const INITIAL_WALLETS: WalletDto[] = [
  {
    id: "w1",
    name: "Main Cash",
    walletType: "SPENDINGS",
    currency: "EUR",
    currentBalanceCents: "5000",
    archivedAt: null,
  },
  {
    id: "w2",
    name: "Safety Net",
    walletType: "CUSHION",
    currency: "EUR",
    currentBalanceCents: "20000",
    archivedAt: null,
  },
  {
    id: "w3",
    name: "Emergency Fund",
    walletType: "RESERVE",
    currency: "EUR",
    currentBalanceCents: "100000",
    archivedAt: null,
  },
  {
    id: "w4",
    name: "House",
    walletType: "POSSESSION",
    currency: "EUR",
    currentBalanceCents: "40000000",
    archivedAt: null,
  },
  {
    id: "w5",
    name: "Loose change",
    walletType: "OTHER",
    currency: "EUR",
    currentBalanceCents: "700",
    archivedAt: null,
  },
];

function renderWithQuery(
  initial: WalletDto[] = INITIAL_WALLETS,
  opts: { reservesEnabled?: boolean; investmentsEnabled?: boolean } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Client-data: the list comes from useWallets, not an `initial` prop. Seed the
  // query cache so useWallets is isSuccess with the rows.
  qc.setQueryData(["budget", "budget-1", "wallets"], initial);
  // SPA refactor (260616): budget meta (currency + section flags) now comes from
  // useBudget instead of props. Seed the detail query so it is warm.
  qc.setQueryData(["budget", "budget-1", "detail"], {
    id: "budget-1",
    name: "Test Budget",
    currency: "EUR",
    defaultCurrency: "EUR",
    reservesEnabled: opts.reservesEnabled ?? true,
    cushionEnabled: true,
    investmentsEnabled: opts.investmentsEnabled ?? true,
  });
  return render(
    <QueryClientProvider client={qc}>
      <WalletsSectionedList budgetId="budget-1" />
    </QueryClientProvider>,
  );
}

describe("WalletsSectionedList", () => {
  it("renders all three section headers", () => {
    renderWithQuery();
    expect(screen.getByText("Spendings wallets")).toBeInTheDocument();
    expect(screen.getByText("Cushion wallets")).toBeInTheDocument();
    expect(screen.getByText("Reserve wallets")).toBeInTheDocument();
  });

  it("renders all three section data-testids", () => {
    renderWithQuery();
    expect(screen.getByTestId("wallet-section-SPENDINGS")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-section-CUSHION")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-section-RESERVE")).toBeInTheDocument();
  });

  it("renders each wallet row in the correct section", () => {
    renderWithQuery();
    // All 3 wallet rows present
    const rows = screen.getAllByTestId("wallet-row");
    expect(rows).toHaveLength(5);
    // Each row has the correct data-wallet-id (W-5)
    const ids = rows.map((r) => r.getAttribute("data-wallet-id"));
    expect(ids).toContain("w1");
    expect(ids).toContain("w2");
    expect(ids).toContain("w3");
  });

  // Every section reports what it holds, in BUDGET currency, on the header row
  // (user, 260822). The point is the mixed-currency section: five cushion
  // wallets in four currencies read as one figure. The server enriches each
  // wallet with `currentBalanceInBudgetCurrencyCents`; the sum already existed
  // to drive the Share column and is now shown.
  describe("section totals", () => {
    it("totals each section in the budget currency", () => {
      renderWithQuery([
        {
          id: "c1",
          name: "Cash USD",
          walletType: "CUSHION",
          currency: "USD",
          currentBalanceCents: "125100",
          currentBalanceInBudgetCurrencyCents: "455000",
          archivedAt: null,
        },
        {
          id: "c2",
          name: "Cash CHF",
          walletType: "CUSHION",
          currency: "CHF",
          currentBalanceCents: "470000",
          currentBalanceInBudgetCurrencyCents: "2045000",
          archivedAt: null,
        },
      ] as WalletDto[]);
      // 4,550 + 20,450 = 25,000 — neither wallet's own number.
      expect(
        screen.getByTestId("section-total-CUSHION").textContent,
      ).toContain("25,000");
      expect(
        screen.getByTestId("section-total-currency-CUSHION").textContent,
      ).toBe("EUR");
    });

    // Without the FX figure the raw balance is all there is — a fixture or a
    // caller that bypasses the route layer must still add up, not blank out.
    it("falls back to the raw balance when FX has not enriched a wallet", () => {
      renderWithQuery();
      expect(
        screen.getByTestId("section-total-SPENDINGS").textContent,
      ).toContain("50");
    });
  });

  it("renders DashedAddButton for each section", () => {
    renderWithQuery();
    expect(screen.getByTestId("add-wallet-spendings")).toBeInTheDocument();
    expect(screen.getByTestId("add-wallet-cushion")).toBeInTheDocument();
    expect(screen.getByTestId("add-wallet-reserve")).toBeInTheDocument();
  });

  it("renders DndContext wrapping the sections", () => {
    renderWithQuery();
    expect(screen.getByTestId("dnd-context")).toBeInTheDocument();
  });

  describe("D-PH5-R11 cascading-hide surface 4 — Reserve wallet section", () => {
    it("reservesEnabled defaults true → Reserve section rendered", () => {
      renderWithQuery();
      expect(screen.getByTestId("wallet-section-RESERVE")).toBeInTheDocument();
      expect(screen.getByText("Reserve wallets")).toBeInTheDocument();
    });

    it("reservesEnabled={true} explicit → Reserve section rendered", () => {
      renderWithQuery(INITIAL_WALLETS, { reservesEnabled: true });
      expect(screen.getByTestId("wallet-section-RESERVE")).toBeInTheDocument();
    });

    it("reservesEnabled={false} → Reserve section + add-button hidden; existing RESERVE wallets not rendered", () => {
      renderWithQuery(INITIAL_WALLETS, { reservesEnabled: false });
      expect(
        screen.queryByTestId("wallet-section-RESERVE"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("add-wallet-reserve"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Reserve wallets")).not.toBeInTheDocument();
      // Spendings + Cushion still present
      expect(
        screen.getByTestId("wallet-section-SPENDINGS"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("wallet-section-CUSHION")).toBeInTheDocument();
      // RESERVE-typed wallet w3 not rendered (no section to host it).
      const rows = screen.queryAllByTestId("wallet-row");
      const renderedIds = rows.map((r) => r.getAttribute("data-wallet-id"));
      expect(renderedIds).not.toContain("w3");
    });
  });

  // 260803: possessions stopped being holdings and OTHER arrived. Both are
  // ordinary wallet sections — always on, no feature flag.
  describe("possession + other sections", () => {
    it("puts them AFTER investments — they are assets, not spending pools", () => {
      renderWithQuery();
      const order = [
        ...document.querySelectorAll(
          '[data-testid^="wallet-section-"], [data-testid="investments-section"]',
        ),
      ].map((n) => n.getAttribute("data-testid"));
      expect(order).toEqual([
        "wallet-section-SPENDINGS",
        "wallet-section-CUSHION",
        "wallet-section-RESERVE",
        "investments-section",
        "wallet-section-POSSESSION",
        "wallet-section-OTHER",
      ]);
    });

    it("still renders when investments are off", () => {
      renderWithQuery(INITIAL_WALLETS, { investmentsEnabled: false });
      expect(
        screen.queryByTestId("investments-section"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("wallet-section-POSSESSION"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("wallet-section-OTHER")).toBeInTheDocument();
    });

    it("renders both sections with their add buttons", () => {
      renderWithQuery();
      expect(
        screen.getByTestId("wallet-section-POSSESSION"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("wallet-section-OTHER")).toBeInTheDocument();
      expect(screen.getByText("Possessions")).toBeInTheDocument();
      expect(screen.getByText("Other assets")).toBeInTheDocument();
      expect(screen.getByTestId("add-wallet-possession")).toBeInTheDocument();
      expect(screen.getByTestId("add-wallet-other")).toBeInTheDocument();
    });

    it("puts each wallet in its own section", () => {
      renderWithQuery();
      const idsIn = (type: string) =>
        Array.from(
          screen
            .getByTestId(`wallet-section-${type}`)
            .querySelectorAll("[data-wallet-id]"),
        ).map((n) => n.getAttribute("data-wallet-id"));
      expect(idsIn("POSSESSION")).toEqual(["w4"]);
      expect(idsIn("OTHER")).toEqual(["w5"]);
      expect(idsIn("SPENDINGS")).toEqual(["w1"]);
    });

    it("survives the reserve + cushion sections being switched off", () => {
      renderWithQuery(INITIAL_WALLETS, { reservesEnabled: false });
      expect(
        screen.getByTestId("wallet-section-POSSESSION"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("wallet-section-OTHER")).toBeInTheDocument();
    });
  });

  describe("moving a wallet between sections", () => {
    beforeEach(() => {
      mockWrite.mockReset();
      mockWrite.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ wallet: { ...INITIAL_WALLETS[3] } }),
      });
    });

    const drop = (walletId: string, sectionType: string) =>
      act(() => {
        dnd.onDragEnd?.({
          active: { id: walletId },
          over: { id: `section-${sectionType}` },
        });
      });

    const patchedType = () => {
      const [, init] = mockWrite.mock.calls[0] as [string, RequestInit];
      return JSON.parse(String(init.body)).walletType;
    };

    it("PATCHes a possession into the spendings section", async () => {
      renderWithQuery();
      drop("w4", "SPENDINGS");
      await waitFor(() => expect(mockWrite).toHaveBeenCalled());
      expect(mockWrite.mock.calls[0][0]).toBe("/wallets/w4");
      expect(patchedType()).toBe("SPENDINGS");
    });

    it("PATCHes a spendings wallet into the possession section", async () => {
      renderWithQuery();
      drop("w1", "POSSESSION");
      await waitFor(() => expect(mockWrite).toHaveBeenCalled());
      expect(patchedType()).toBe("POSSESSION");
    });

    it("PATCHes a possession into the other section", async () => {
      renderWithQuery();
      drop("w4", "OTHER");
      await waitFor(() => expect(mockWrite).toHaveBeenCalled());
      expect(patchedType()).toBe("OTHER");
    });

    it("does nothing when the wallet is dropped on its own section", async () => {
      renderWithQuery();
      drop("w5", "OTHER");
      await new Promise((r) => setTimeout(r, 20));
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });

  it("renders with empty initial data (no wallet rows)", () => {
    renderWithQuery([]);
    const rows = screen.queryAllByTestId("wallet-row");
    expect(rows).toHaveLength(0);
    // Sections still render
    expect(screen.getByTestId("wallet-section-SPENDINGS")).toBeInTheDocument();
  });
});
