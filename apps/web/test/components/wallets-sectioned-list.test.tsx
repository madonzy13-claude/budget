/**
 * wallets-sectioned-list.test.tsx — Vitest+RTL tests for WalletsSectionedList.
 *
 * Coverage:
 * - Renders 3 sections (SPENDINGS, CUSHION, RESERVE) when wallets are provided
 * - Each section has its DashedAddButton
 * - Wallets appear in the correct sections
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletsSectionedList } from "../../src/components/budgeting/wallets-tab/wallets-sectioned-list";
import type { WalletDto } from "../../src/hooks/use-wallets";

// Mock next-intl — useTranslations returns a function that translates relative keys
// Components call: useTranslations("bdp.tab.wallets") → t("section.spendings")
vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) =>
    (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        // Relative keys (as used by component internals)
        "section.spendings": "Spendings wallets",
        "section.cushion": "Cushion wallets",
        "section.reserve": "Reserve wallets",
        "add.spendings": "Add spendings wallet",
        "add.cushion": "Add cushion wallet",
        "add.reserve": "Add reserve wallet",
        "row.namePlaceholder": "Wallet name",
        "row.nameAria": "Wallet name. Click to edit.",
        "row.currencyAria": "Currency. Click to edit.",
        "row.currencyReadOnlyAria": "Currency {ccy}. Reserve wallets must match budget currency.",
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
    <div data-testid="dnd-context" data-on-drag-end={String(!!onDragEnd)}>
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
}));

// Mock clientApiFetch (not called on initial render)
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(),
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
];

function renderWithQuery(initial: WalletDto[] = INITIAL_WALLETS) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <WalletsSectionedList
        budgetId="budget-1"
        budgetCurrency="EUR"
        initial={initial}
      />
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
    expect(rows).toHaveLength(3);
    // Each row has the correct data-wallet-id (W-5)
    const ids = rows.map((r) => r.getAttribute("data-wallet-id"));
    expect(ids).toContain("w1");
    expect(ids).toContain("w2");
    expect(ids).toContain("w3");
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

  it("renders with empty initial data (no wallet rows)", () => {
    renderWithQuery([]);
    const rows = screen.queryAllByTestId("wallet-row");
    expect(rows).toHaveLength(0);
    // Sections still render
    expect(screen.getByTestId("wallet-section-SPENDINGS")).toBeInTheDocument();
  });
});
