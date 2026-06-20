/**
 * reserves-table-client-excluded.test.tsx — Vitest+RTL tests for ReservesTableClient.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md): rows carry the engine shape
 * {reserveCents, usedCents, overspentCents}; totals carry
 * {internalCents, userDefinedCents, surplusCents, direction, disabled, ...}.
 *
 * W-3 acceptance contract (updated for 05-19 reshape):
 * - Active section sources rows from summary.rows (single Available cell, NO used cell)
 * - Excluded section sources rows from summary.excludedRows (name-only)
 * - clientApiFetch is NEVER called with a /categories path (single source of truth)
 * - When totals.disabled=true, renders "Reserves disabled" notice
 * - The totals footer renders 3 stacked labels and NO surplus banner
 * - The TOTAL USED line sums the active rows' usedCents
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservesTableClient } from "../../src/components/budgeting/reserves-tab/reserves-table-client";
import { TestQueryProvider, makeTestQueryClient } from "../setup/query-client";
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
  useLocale: () => "en",
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
      reserveCents: "30000",
      usedCents: "1200",
      usedThisMonthCents: "1200",
      overspentCents: "0",
    },
    {
      categoryId: "C",
      name: "Transport",
      reserveCents: "20000",
      usedCents: "800",
      usedThisMonthCents: "800",
      overspentCents: "0",
    },
  ],
  excludedRows: [
    {
      categoryId: "B",
      name: "Hobbies",
      reserveCents: "50000",
      usedCents: "0",
      usedThisMonthCents: "0",
      overspentCents: "0",
    },
  ],
  totals: {
    internalCents: "30000",
    userDefinedCents: "30000",
    surplusCents: "0",
    direction: "NONE",
    usedCents: "2000", // server TOTAL USED (all time) = active 1200 + 800
    usedThisMonthCents: "2000", // this month
    disabled: false,
    budgetCurrency: "EUR",
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderClient(overrideInitial?: Partial<ReservesSummaryDto>) {
  const data = { ...initial, ...overrideInitial };
  // SPA refactor (260616): data comes from useReservesSummary, not an `initial`
  // prop. Seed the query cache so the hook is isSuccess with the rows.
  const qc = makeTestQueryClient();
  qc.setQueryData(["budget", "budget-1", "reserves"], data);
  return render(
    <TestQueryProvider client={qc}>
      <ReservesTableClient budgetId="budget-1" />
    </TestQueryProvider>,
  );
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("ReservesTableClient — engine model + W-3 excluded rows", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => initial,
    });
  });

  it("Active section renders the Housing row with an available cell and NO used cell", () => {
    renderClient();
    const activeSection = screen.getByTestId("reserves-active-section");
    const housingRow = screen.getByTestId("reserves-row-A");
    expect(activeSection).toContainElement(housingRow);
    expect(
      housingRow.querySelector('[data-testid="reserves-balance-A"]'),
    ).not.toBeNull();
    expect(
      housingRow.querySelector('[data-testid="reserves-used-A"]'),
    ).toBeNull();
  });

  it("Excluded section renders Hobbies as a name-only row (no reserve, no used)", () => {
    renderClient();
    const excludedSection = screen.getByTestId("reserves-excluded-section");
    const hobbiesRow = screen.getByTestId("reserves-row-B");
    expect(excludedSection).toContainElement(hobbiesRow);
    expect(hobbiesRow.textContent).toMatch(/Hobbies/);
    expect(
      hobbiesRow.querySelector('[data-testid="reserves-balance-B"]'),
    ).toBeNull();
    expect(
      hobbiesRow.querySelector('[data-testid="reserves-used-B"]'),
    ).toBeNull();
  });

  it("renders the totals footer with NO surplus banner (removed in 05-19)", () => {
    renderClient();
    expect(screen.getByTestId("reserves-totals-footer")).toBeInTheDocument();
    expect(
      screen.queryByTestId("reserves-surplus-banner"),
    ).not.toBeInTheDocument();
  });

  it("footer renders the 3 stacked total labels (available / wallets / used)", () => {
    renderClient();
    const footer = screen.getByTestId("reserves-totals-footer");
    // next-intl mock echoes the key — assert all three label keys render.
    expect(footer.textContent).toContain("totals.internalLabel");
    expect(footer.textContent).toContain("totals.walletsLabel");
    expect(footer.textContent).toContain("totals.usedLabel");
  });

  it("TOTAL USED line sums the active rows' usedCents (1200 + 800 = 2000c → 20)", () => {
    renderClient();
    const usedTotal = screen.getByTestId("reserves-total-used");
    // 2000 cents → "20" (centsToBare drops the whole-unit .00).
    expect(usedTotal.textContent).toMatch(/20 EUR/);
  });

  it("TOTAL USED excludes excluded-row usedCents (only active rows count)", () => {
    renderClient({
      excludedRows: [
        {
          categoryId: "B",
          name: "Hobbies",
          reserveCents: "50000",
          usedCents: "99900",
          usedThisMonthCents: "99900",
          overspentCents: "0",
        },
      ],
    });
    const usedTotal = screen.getByTestId("reserves-total-used");
    // Still 20 (active 1200+800), the 99900 excluded used is NOT summed.
    expect(usedTotal.textContent).toMatch(/20 EUR/);
    expect(usedTotal.textContent).not.toMatch(/999/);
  });

  it("clientApiFetch is NEVER called with a /categories path (single-source-of-truth)", () => {
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
