/**
 * reserves-table-client-excluded.test.tsx — Vitest+RTL tests for ReservesTableClient.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md): rows carry the engine shape
 * {reserveCents, usedCents, overspentCents}; totals carry
 * {internalCents, userDefinedCents, surplusCents, direction, disabled, ...}.
 *
 * W-3 acceptance contract:
 * - Active section sources rows from summary.rows (reserve + used cells)
 * - Excluded section sources rows from summary.excludedRows (name-only)
 * - clientApiFetch is NEVER called with a /categories path (single source of truth)
 * - When totals.disabled=true, renders "Reserves disabled" notice
 * - The SurplusBanner renders in the totals footer with the engine direction
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
      usedCents: "0",
      overspentCents: "0",
    },
  ],
  excludedRows: [
    {
      categoryId: "B",
      name: "Hobbies",
      reserveCents: "50000",
      usedCents: "0",
      overspentCents: "0",
    },
  ],
  totals: {
    internalCents: "30000",
    userDefinedCents: "30000",
    surplusCents: "0",
    direction: "NONE",
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

describe("ReservesTableClient — engine model + W-3 excluded rows", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => initial,
    });
  });

  it("Active section renders the Housing row with a reserve cell", () => {
    renderClient();
    const activeSection = screen.getByTestId("reserves-active-section");
    const housingRow = screen.getByTestId("reserves-row-A");
    expect(activeSection).toContainElement(housingRow);
    expect(
      housingRow.querySelector('[data-testid="reserves-balance-A"]'),
    ).not.toBeNull();
    expect(
      housingRow.querySelector('[data-testid="reserves-used-A"]'),
    ).not.toBeNull();
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

  it("renders the surplus banner in the totals footer", () => {
    renderClient();
    const banner = screen.getByTestId("reserves-surplus-banner");
    expect(banner).toHaveAttribute("data-direction", "NONE");
  });

  it("renders the TOPUP surplus banner when internal exceeds userDefined", () => {
    renderClient({
      totals: {
        ...initial.totals,
        internalCents: "50000",
        userDefinedCents: "30000",
        surplusCents: "-20000",
        direction: "TOPUP",
      },
    });
    expect(screen.getByTestId("reserves-surplus-banner")).toHaveAttribute(
      "data-direction",
      "TOPUP",
    );
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
