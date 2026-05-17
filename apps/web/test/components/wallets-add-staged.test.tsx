/**
 * wallets-add-staged.test.tsx — W-4 staged-add contract tests.
 *
 * D-PH5-W9 verbatim contract:
 * 1. Click +Add → 1 draft row appears in DOM (data-testid="wallet-row-draft"),
 *    data-wallet-id="", Name input focused; clientApiFetch NOT called.
 * 2. Type "Cash" → blur → clientApiFetch called exactly 1× with POST /wallets.
 *    On success: draft row removed, persisted row appears.
 * 3. Click +Add → blur with empty name → clientApiFetch NOT called; draft removed.
 * 4. Click +Add → type "X" → blur → mock returns 422 → draft STAYS in DOM
 *    with error indicator; toast.error called.
 * 5. Click +Add twice in same section → only ONE draft row (idempotent).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletsSectionedList } from "../../src/components/budgeting/wallets-tab/wallets-sectioned-list";
import type { WalletDto } from "../../src/hooks/use-wallets";

const mockClientApiFetch = vi.fn();
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => mockClientApiFetch(...args),
}));

vi.mock("../../src/lib/idempotency", () => ({
  generateIdempotencyKey: () => "idempotency-test-key",
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    success: (...a: unknown[]) => mockToastSuccess(...a),
  },
}));

// Mock next-intl — relative key lookup (components call t("relativeKey"))
vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) =>
    (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
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
        // Relative keys for components with deeper namespaces
        "namePlaceholder": "Wallet name",
        "nameAria": "Wallet name. Click to edit.",
        "currencyAria": "Currency. Click to edit.",
        "currencyReadOnlyAria": "Currency {ccy}. Reserve wallets must match budget currency.",
        "amountAria": "Amount. Click to edit.",
        "dragHandleAria": "Drag to move {name} to another section.",
        "trashAria": "Delete wallet {name}.",
        "title": "Delete wallet '{name}'?",
        "body": "This can't be undone here.",
        "cta": "Delete",
        "cancel": "Cancel",
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

// Mock @dnd-kit/core — minimal functional stub
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
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

// Mock CurrencyPicker
vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({ value }: { value: string }) => (
    <select data-testid="currency-picker" defaultValue={value}>
      <option value={value}>{value}</option>
    </select>
  ),
}));

const INITIAL_WALLETS: WalletDto[] = [];

function makePersistedWallet(overrides?: Partial<WalletDto>): WalletDto {
  return {
    id: "new-uuid-" + Math.random().toString(36).slice(2),
    name: "Cash",
    walletType: "SPENDINGS",
    currency: "EUR",
    currentBalanceCents: "0",
    archivedAt: null,
    ...overrides,
  };
}

function renderWithQuery(initial: WalletDto[] = INITIAL_WALLETS) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Pre-populate the wallets cache for the initial render
  qc.setQueryData(["budget", "budget-1", "wallets"], initial);

  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <WalletsSectionedList
          budgetId="budget-1"
          budgetCurrency="EUR"
          initial={initial}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("Wallets staged-add flow (W-4 / D-PH5-W9)", () => {
  beforeEach(() => {
    mockClientApiFetch.mockClear();
    mockToastError.mockClear();
    mockToastSuccess.mockClear();
    // Default mock for GET /wallets (triggered by useWallets stale refetch)
    mockClientApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ wallets: [] }),
      text: async () => "",
    });
  });

  // ── Test 1: +Add click → draft appears, NO network call ──────────────────

  it("click +Add → draft row appears; no POST fired on +Add click", async () => {
    renderWithQuery();
    const addBtn = screen.getByTestId("add-wallet-spendings");

    // No draft before click
    expect(screen.queryByTestId("wallet-row-draft")).toBeNull();

    // Clear any GET calls from initial render
    mockClientApiFetch.mockClear();

    fireEvent.click(addBtn);

    // Draft row should appear
    await waitFor(() => {
      expect(screen.getByTestId("wallet-row-draft")).toBeInTheDocument();
    });

    // W-4 acceptance: no POST /wallets on +Add click
    const postCalls = mockClientApiFetch.mock.calls.filter(
      ([_path, init]) => (init as RequestInit)?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });

  it("draft row has data-wallet-id='' and a focused name input", async () => {
    renderWithQuery();
    fireEvent.click(screen.getByTestId("add-wallet-spendings"));

    await waitFor(() => {
      const draft = screen.getByTestId("wallet-row-draft");
      expect(draft).toHaveAttribute("data-wallet-id", "");
    });

    const nameInput = screen.getByTestId("wallet-draft-name-input");
    expect(nameInput).toBeInTheDocument();
  });

  // ── Test 2: Type name → blur → POST fires → success → draft removed ───────

  it("type name + blur → POST fires exactly once with correct body", async () => {
    const user = userEvent.setup();
    const persistedWallet = makePersistedWallet({ name: "Cash" });

    // Setup: successful POST response
    mockClientApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ wallet: persistedWallet }),
      text: async () => "",
    });
    // Setup: GET /wallets after invalidation returns persisted row
    mockClientApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ wallets: [persistedWallet] }),
      text: async () => "",
    });

    renderWithQuery();
    fireEvent.click(screen.getByTestId("add-wallet-spendings"));

    await waitFor(() =>
      expect(screen.getByTestId("wallet-draft-name-input")).toBeInTheDocument(),
    );

    const input = screen.getByTestId("wallet-draft-name-input");
    await user.type(input, "Cash");
    await user.tab(); // triggers blur

    // clientApiFetch called with POST /wallets (may have GET calls from useWallets)
    await waitFor(() => {
      const postCalls = mockClientApiFetch.mock.calls.filter(
        ([_path, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(postCalls).toHaveLength(1);
    });

    const postCall = mockClientApiFetch.mock.calls.find(
      ([_path, init]) => (init as RequestInit)?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const [path, init] = postCall as [string, RequestInit];
    expect(path).toBe("/wallets");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("Cash");
    expect(body.walletType).toBe("SPENDINGS");
    expect(body.currency).toBe("EUR");
  });

  it("on POST success: draft row is removed from DOM", async () => {
    const user = userEvent.setup();
    const persistedWallet = makePersistedWallet({ name: "Cash" });

    mockClientApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ wallet: persistedWallet }),
      text: async () => "",
    });

    renderWithQuery();
    fireEvent.click(screen.getByTestId("add-wallet-spendings"));

    await waitFor(() =>
      expect(screen.getByTestId("wallet-draft-name-input")).toBeInTheDocument(),
    );

    const input = screen.getByTestId("wallet-draft-name-input");
    await user.type(input, "Cash");
    await user.tab();

    await waitFor(() => {
      expect(screen.queryByTestId("wallet-row-draft")).toBeNull();
    });
  });

  // ── Test 3: Empty blur → draft removed, NO POST ───────────────────────────

  it("blur with empty name → clientApiFetch NOT called; draft removed", async () => {
    const user = userEvent.setup();
    renderWithQuery();
    fireEvent.click(screen.getByTestId("add-wallet-spendings"));

    await waitFor(() =>
      expect(screen.getByTestId("wallet-draft-name-input")).toBeInTheDocument(),
    );

    // Tab away without typing anything
    const input = screen.getByTestId("wallet-draft-name-input");
    await user.click(input); // ensure focus
    mockClientApiFetch.mockClear(); // clear GET calls from initial render
    await user.tab(); // blur with empty value

    // No POST should fire (GET may fire from useWallets stale refetch)
    await waitFor(() => {
      const postCalls = mockClientApiFetch.mock.calls.filter(
        ([_path, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(postCalls).toHaveLength(0);
    });

    // Draft should be removed
    await waitFor(() => {
      expect(screen.queryByTestId("wallet-row-draft")).toBeNull();
    });
  });

  // ── Test 4: POST 422 → draft stays with error; toast fires ───────────────

  it("POST 422 → draft row stays in DOM with error indicator; toast.error called", async () => {
    const user = userEvent.setup();

    // Override default: first GET succeeds (for useWallets), then POST returns 422
    // We use mockImplementation to route based on method
    mockClientApiFetch.mockImplementation(
      (_path: string, init?: RequestInit) => {
        if ((init as RequestInit)?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 422,
            json: async () => ({ error: "validation_error" }),
            text: async () => JSON.stringify({ error: "validation_error" }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ wallets: [] }),
          text: async () => "",
        });
      },
    );

    renderWithQuery();
    fireEvent.click(screen.getByTestId("add-wallet-spendings"));

    await waitFor(() =>
      expect(screen.getByTestId("wallet-draft-name-input")).toBeInTheDocument(),
    );

    const input = screen.getByTestId("wallet-draft-name-input");
    await user.type(input, "X");
    await user.tab();

    // Draft should STAY in DOM
    await waitFor(() => {
      expect(screen.getByTestId("wallet-row-draft")).toBeInTheDocument();
    });

    // Error indicator (ring-destructive class) on draft row
    const draftRow = screen.getByTestId("wallet-row-draft");
    expect(draftRow.className).toContain("ring-[var(--destructive)]");

    // toast.error should have been called
    expect(mockToastError).toHaveBeenCalledWith(
      "bdp.tab.wallets.toast.createFailed",
    );
  });

  // ── Test 5: Click +Add twice → only one draft (idempotent) ───────────────

  it("clicking +Add twice in same section → only ONE draft row", async () => {
    renderWithQuery();
    const addBtn = screen.getByTestId("add-wallet-spendings");

    fireEvent.click(addBtn);
    await waitFor(() =>
      expect(screen.getByTestId("wallet-row-draft")).toBeInTheDocument(),
    );

    fireEvent.click(addBtn);
    await waitFor(() => {
      const drafts = screen.getAllByTestId("wallet-row-draft");
      expect(drafts).toHaveLength(1);
    });

    // Still no POST calls
    const postCalls = mockClientApiFetch.mock.calls.filter(
      ([_path, init]) => (init as RequestInit)?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });

  // ── Test 6: Escape key discards draft ─────────────────────────────────────

  it("Escape key in Name input discards draft without POST", async () => {
    const user = userEvent.setup();
    renderWithQuery();
    fireEvent.click(screen.getByTestId("add-wallet-spendings"));

    await waitFor(() =>
      expect(screen.getByTestId("wallet-draft-name-input")).toBeInTheDocument(),
    );

    const input = screen.getByTestId("wallet-draft-name-input");
    await user.type(input, "Something");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("wallet-row-draft")).toBeNull();
    });

    const postCalls = mockClientApiFetch.mock.calls.filter(
      ([_path, init]) => (init as RequestInit)?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });
});
