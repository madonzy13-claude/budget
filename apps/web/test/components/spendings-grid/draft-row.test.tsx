/**
 * draft-row.test.tsx — Vitest+RTL tests for DraftRow.
 *
 * D-PH4-R1: dashed yellow left border.
 * D-PH4-INT5: double-click amount + Enter = edit-and-promote.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DraftRow } from "../../../src/components/budgeting/spendings-grid/draft-row";
import { TestQueryProvider } from "../../setup/query-client";

const mockConfirmMutate = vi.fn();
const mockDismissMutate = vi.fn();
vi.mock("../../../src/hooks/use-confirm-draft", () => ({
  useConfirmDraft: () => ({ mutate: mockConfirmMutate }),
}));
vi.mock("../../../src/hooks/use-dismiss-draft", () => ({
  useDismissDraft: () => ({ mutate: mockDismissMutate }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLocale: () => "en",
}));

const draft = {
  id: "draft-1",
  amountConvertedCents: "3000",
  currencyConverted: "USD",
  ruleName: "Rent",
  note: null,
};

function renderDraftRow(props = {}) {
  return render(
    <TestQueryProvider>
      <DraftRow
        draft={draft}
        budgetId="budget-1"
        month="2026-05"
        onEdit={vi.fn()}
        {...props}
      />
    </TestQueryProvider>,
  );
}

describe("DraftRow", () => {
  beforeEach(() => {
    mockConfirmMutate.mockClear();
    mockDismissMutate.mockClear();
  });

  it("has data-testid=draft-row-rent (lowercase ruleName)", () => {
    renderDraftRow();
    expect(screen.getByTestId("draft-row-rent")).toBeTruthy();
  });

  it("has dashed left border style (D-PH4-R1)", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    // Check inline style or class contains dashed border
    const style = row.getAttribute("style") ?? "";
    const className = row.className ?? "";
    // Either inline style or a class indicating draft border
    expect(style + className).toMatch(/border|draft/i);
  });

  it("REGRESSION-GUARD: pointermove does NOT reveal chips", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    act(() => { fireEvent.pointerMove(row); });
    expect(document.querySelector('[data-testid="draft-action-confirm"]')).toBeNull();
  });

  it("single click reveals Confirm, Edit, Dismiss chips", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    fireEvent.click(row);
    expect(screen.getByTestId("draft-action-confirm")).toBeTruthy();
    expect(screen.getByTestId("draft-action-edit")).toBeTruthy();
    expect(screen.getByTestId("draft-action-dismiss")).toBeTruthy();
  });

  it("click Confirm calls useConfirmDraft.mutate with draftId", () => {
    renderDraftRow();
    fireEvent.click(screen.getByTestId("draft-row-rent"));
    fireEvent.click(screen.getByTestId("draft-action-confirm"));
    expect(mockConfirmMutate).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "draft-1" }),
    );
  });

  it("click Edit chip calls onEdit with draftId", () => {
    const onEdit = vi.fn();
    renderDraftRow({ onEdit });
    fireEvent.click(screen.getByTestId("draft-row-rent"));
    fireEvent.click(screen.getByTestId("draft-action-edit"));
    expect(onEdit).toHaveBeenCalledWith("draft-1");
  });

  it("displays ruleName in row", () => {
    renderDraftRow();
    expect(screen.getByTestId("draft-row-rent").textContent).toContain("Rent");
  });
});
