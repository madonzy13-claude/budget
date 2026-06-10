/**
 * wallet-row.test.tsx — Vitest+RTL tests for WalletRow.
 *
 * Coverage:
 * - Persisted SPENDINGS wallet: Currency cell is InlineEditCell; row has data-wallet-id (W-5)
 * - Persisted RESERVE wallet: Currency cell is read-only plain text
 * - Draft mode: data-testid="wallet-row-draft", data-wallet-id="", no trash button
 * - Draft mode with error: ring-destructive class present
 * - Trash button click on persisted wallet opens AlertDialog
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WalletRow } from "../../src/components/budgeting/wallets-tab/wallet-row";
import type { WalletDto } from "../../src/hooks/use-wallets";

// Mock next-intl — relative key lookup (components call t("relativeKey"))
// WalletRow uses useTranslations("bdp.tab.wallets.row") → t("namePlaceholder")
// WalletDeleteConfirm uses useTranslations("bdp.tab.wallets.confirm.delete") → t("title", {name})
vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        namePlaceholder: "Wallet name",
        nameAria: "Wallet name. Click to edit.",
        currencyAria: "Currency. Click to edit.",
        currencyReadOnlyAria:
          "Currency {ccy}. Reserve wallets must match budget currency.",
        amountAria: "Amount. Click to edit.",
        shareAria: "{name} share of section total.",
        dragHandleAria: "Drag to move {name} to another section.",
        trashAria: "Delete wallet {name}.",
        title: "Delete wallet '{name}'?",
        body: "This can't be undone here.",
        cta: "Delete",
        cancel: "Cancel",
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

// Mock @dnd-kit/core — no real DND needed for unit tests
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
}));

// UAT-PH5-T3-17: wallet-row now uses useSortable for the spendings-grid-style
// "siblings make room" animation. The sortable hook is a thin layer on top of
// useDraggable + useDroppable; mock it identically for unit-test purposes.
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
    isOver: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  verticalListSortingStrategy: undefined,
}));

// Mock @dnd-kit/utilities — only CSS.Transform.toString used by wallet-row.
vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: { toString: () => undefined },
    Translate: { toString: () => undefined },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock CurrencyPicker — minimal select stub
vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <select
      data-testid="currency-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="EUR">EUR</option>
      <option value="USD">USD</option>
    </select>
  ),
}));

const SPENDINGS_WALLET: WalletDto = {
  id: "wallet-spendings-1",
  name: "Cash",
  walletType: "SPENDINGS",
  currency: "EUR",
  currentBalanceCents: "5000",
  archivedAt: null,
};

const RESERVE_WALLET: WalletDto = {
  id: "wallet-reserve-1",
  name: "Emergency Fund",
  walletType: "RESERVE",
  currency: "EUR",
  currentBalanceCents: "100000",
  archivedAt: null,
};

describe("WalletRow — persisted mode", () => {
  it("emits data-wallet-id={wallet.id} per W-5 contract", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    const row = screen.getByTestId("wallet-row");
    expect(row).toHaveAttribute("data-wallet-id", "wallet-spendings-1");
  });

  it("renders with data-testid='wallet-row'", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    expect(screen.getByTestId("wallet-row")).toBeInTheDocument();
  });

  it("SPENDINGS wallet: Currency cell renders InlineEditCell (editable)", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    // UAT-PH5-T3-42: CurrencyPicker now renders directly (no
    // InlineEditCell wrapper) so the picker handles its own
    // touch/desktop rendering — Radix combobox or native select.
    // Verify a usable currency control is present.
    const stub = screen.getByTestId("currency-picker");
    expect(stub).toBeInTheDocument();
  });

  it("RESERVE wallet: Currency cell is plain text with aria-label (read-only per D-PH5-R3)", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={RESERVE_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={true}
      />,
    );
    // No InlineEditCell for currency in RESERVE section — plain text span
    const currencyCell = screen.queryByTestId(
      `wallet-currency-${RESERVE_WALLET.id}`,
    );
    expect(currencyCell).toBeNull();
    // Should have aria-label indicating read-only
    const readOnlySpan = screen.getByLabelText(/Currency EUR/);
    expect(readOnlySpan).toBeInTheDocument();
  });

  // UAT-PH5-T3-14 + T3-45: Share column reflects wallet's share among
  // same-currency siblings in the section.
  it("renders Share column = wallet.amount / same-currency total as %", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        sectionTotalBudgetCents={20000}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    // SPENDINGS_WALLET cents = 5000 / EUR total 20000 = 25%
    const share = screen.getByTestId(`wallet-share-${SPENDINGS_WALLET.id}`);
    expect(share).toHaveTextContent("25%");
  });

  it("Share column renders em-dash when same-currency total = 0", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={{ ...SPENDINGS_WALLET, currentBalanceCents: "0" }}
        budgetCurrency="EUR"
        sectionTotalBudgetCents={0}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    const share = screen.getByTestId(`wallet-share-${SPENDINGS_WALLET.id}`);
    expect(share).toHaveTextContent("—");
  });

  // UAT-PH5-T3-12 + T3-32: the desktop trash slot stays in the row layout
  // on the breakpoints where it shows, so the row never shifts width/height
  // on hover. On mobile the trash is replaced by the swipe-revealed Delete
  // button (T3-32) — `hidden sm:flex` is the intended pattern: hidden on
  // mobile, in-flow on desktop. Once visible the button toggles `invisible`
  // / `group-hover:visible` exactly as before.
  it("trash button is desktop-only and reserves layout when visible", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    const trashBtn = screen.getByTestId(`wallet-trash-${SPENDINGS_WALLET.id}`);
    // Mobile-hidden, desktop-visible.
    expect(trashBtn.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(trashBtn.className).toContain("sm:flex");
    // Desktop hover affordance still in place.
    expect(trashBtn.className).toContain("invisible");
    expect(trashBtn.className).toContain("group-hover:visible");
  });

  // UAT-PH5-T3-32: mobile swipe-delete button rendered alongside the row,
  // sm:hidden on desktop, opens the same confirm dialog when tapped.
  it("renders the mobile swipe-delete button (sm:hidden)", () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    const swipeBtn = screen.getByTestId(
      `wallet-swipe-delete-${SPENDINGS_WALLET.id}`,
    );
    expect(swipeBtn).toBeInTheDocument();
    expect(swipeBtn.className).toContain("sm:hidden");
  });

  it("trash button click opens the AlertDialog", async () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    const trashBtn = screen.getByTestId(`wallet-trash-${SPENDINGS_WALLET.id}`);
    fireEvent.click(trashBtn);
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  it("AlertDialog contains the literal 'can't be undone here' copy (D-PH5-W10)", async () => {
    render(
      <WalletRow
        mode="persisted"
        wallet={SPENDINGS_WALLET}
        budgetCurrency="EUR"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        isReserveSection={false}
      />,
    );
    fireEvent.click(screen.getByTestId(`wallet-trash-${SPENDINGS_WALLET.id}`));
    await waitFor(() => {
      expect(
        screen.getByText("This can't be undone here."),
      ).toBeInTheDocument();
    });
  });
});

describe("WalletRow — draft mode", () => {
  it("renders data-testid='wallet-row-draft'", () => {
    render(
      <WalletRow
        mode="draft"
        sectionType="SPENDINGS"
        budgetCurrency="EUR"
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onDiscard={vi.fn()}
        pending={false}
        error={null}
      />,
    );
    expect(screen.getByTestId("wallet-row-draft")).toBeInTheDocument();
  });

  it("emits data-wallet-id='' (empty) per W-5 contract", () => {
    render(
      <WalletRow
        mode="draft"
        sectionType="SPENDINGS"
        budgetCurrency="EUR"
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onDiscard={vi.fn()}
        pending={false}
        error={null}
      />,
    );
    const row = screen.getByTestId("wallet-row-draft");
    expect(row).toHaveAttribute("data-wallet-id", "");
  });

  it("has no trash button in draft mode", () => {
    render(
      <WalletRow
        mode="draft"
        sectionType="SPENDINGS"
        budgetCurrency="EUR"
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onDiscard={vi.fn()}
        pending={false}
        error={null}
      />,
    );
    // No button with trash aria-label
    expect(screen.queryByLabelText(/Delete wallet/)).toBeNull();
  });

  it("applies destructive ring class when error is set", () => {
    render(
      <WalletRow
        mode="draft"
        sectionType="SPENDINGS"
        budgetCurrency="EUR"
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onDiscard={vi.fn()}
        pending={false}
        error="create_failed"
      />,
    );
    const row = screen.getByTestId("wallet-row-draft");
    expect(row.className).toContain("ring-[var(--destructive)]");
  });

  it("does NOT apply destructive ring when error is null", () => {
    render(
      <WalletRow
        mode="draft"
        sectionType="SPENDINGS"
        budgetCurrency="EUR"
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onDiscard={vi.fn()}
        pending={false}
        error={null}
      />,
    );
    const row = screen.getByTestId("wallet-row-draft");
    expect(row.className).not.toContain("ring-[var(--destructive)]");
  });
});
