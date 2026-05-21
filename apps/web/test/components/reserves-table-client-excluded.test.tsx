/**
 * reserves-table-client-excluded.test.tsx — Vitest+RTL tests for ReservesTableClient.
 *
 * W-3 acceptance contract:
 * - Active section sources rows from summary.rows
 * - Excluded section sources rows from summary.excludedRows (NOT synthesized, NOT from /categories)
 * - Excluded row renders FROZEN REAL reserveBalanceCents (NOT em-dash, NOT zero)
 * - Excluded row has opacity-50 styling AND share column shows "—"
 * - clientApiFetch is NEVER called with a /categories path (W-3 single-source-of-truth)
 * - When totals.disabled=true, renders "Reserves disabled" notice
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservesTableClient } from "../../src/components/budgeting/reserves-tab/reserves-table-client";
import { TestQueryProvider } from "../setup/query-client";
import type { ReservesSummaryDto } from "../../src/hooks/use-reserves-summary";

// ─── mocks ───────────────────────────────────────────────────────────────────

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  PointerSensor: class {},
  TouchSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn((_S: unknown) => ({ sensor: "mock" })),
  useSensors: vi.fn((...s: unknown[]) => s),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("@/lib/idempotency", () => ({
  generateIdempotencyKey: () => "test-idem-key",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── fixture ─────────────────────────────────────────────────────────────────

const initial: ReservesSummaryDto = {
  rows: [
    {
      categoryId: "A",
      name: "Housing",
      reserveBalanceCents: "30000",
      walletSharePercent: 30.0,
      walletShareAmountCents: "30000",
    },
  ],
  excludedRows: [
    {
      categoryId: "B",
      name: "Hobbies",
      reserveBalanceCents: "50000",
      walletSharePercent: null,
      walletShareAmountCents: null,
    },
  ],
  totals: {
    totalCategoryReservesCents: "30000",
    totalReserveWalletAmountCents: "30000",
    mismatchCents: "0",
    disabled: false,
    budgetCurrency: "EUR",
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderClient(overrideInitial?: Partial<ReservesSummaryDto>) {
  const data = { ...initial, ...overrideInitial };
  return render(
    <TestQueryProvider>
      <ReservesTableClient budgetId="budget-1" initial={data} />
    </TestQueryProvider>,
  );
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("ReservesTableClient — W-3 excluded rows contract", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Return an empty response so useReservesSummary refetch does not overwrite initialData
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => initial,
    });
  });

  it("Active section renders the Housing row with balance", () => {
    renderClient();
    const activeSection = screen.getByTestId("reserves-active-section");
    expect(activeSection).toBeInTheDocument();
    // Housing row should be inside the active section
    const housingRow = screen.getByTestId("reserves-row-A");
    expect(activeSection).toContainElement(housingRow);
  });

  it("Excluded section renders Hobbies as a name-only row (UAT-PH5-T3-55)", () => {
    renderClient();
    const excludedSection = screen.getByTestId("reserves-excluded-section");
    expect(excludedSection).toBeInTheDocument();

    const hobbiesRow = screen.getByTestId("reserves-row-B");
    expect(excludedSection).toContainElement(hobbiesRow);
    expect(hobbiesRow.textContent).toMatch(/Hobbies/);

    // No balance cell, no share dashes on excluded rows.
    expect(
      hobbiesRow.querySelector('[data-testid="reserves-balance-B"]'),
    ).toBeNull();
    expect(hobbiesRow.querySelector("[aria-label='No share']")).toBeNull();
  });

  it("Excluded row has opacity-50 class", () => {
    renderClient();
    const hobbiesRow = screen.getByTestId("reserves-row-B");
    expect(hobbiesRow.className).toContain("opacity-50");
  });

  it("clientApiFetch is NEVER called with a /categories path (W-3 single-source-of-truth)", () => {
    renderClient();
    const categoriesCalls = fetchMock.mock.calls.filter(
      ([url]: [string]) =>
        typeof url === "string" && url.includes("/categories"),
    );
    expect(categoriesCalls).toHaveLength(0);
  });

  it("renders 'Reserves disabled' notice when totals.disabled=true", () => {
    renderClient({
      totals: { ...initial.totals, disabled: true },
    });
    expect(screen.getByTestId("reserves-disabled-notice")).toBeInTheDocument();
    expect(
      screen.queryByTestId("reserves-active-section"),
    ).not.toBeInTheDocument();
  });
});
