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

  it("has darker-than-column background as draft visual cue", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    const style = row.getAttribute("style") ?? "";
    // Background is set inline to a value darker than the column bg so the
    // row reads as "tentative / not yet confirmed".
    expect(style).toMatch(/background-color:\s*#181c22/i);
  });

  it("REGRESSION-GUARD: pointermove does NOT JS-reveal chips (CSS hover only)", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    const chips = screen.getByTestId("draft-action-confirm").parentElement!;
    // Hidden by default; chips reveal on DESKTOP HOVER via CSS (sm:group-hover),
    // never via a JS pointermove handler.
    expect(chips.className).toContain("hidden");
    expect(chips.className).toContain("sm:group-hover:flex");
    act(() => {
      fireEvent.pointerMove(row);
    });
    expect(chips.className).toContain("hidden"); // still not JS-revealed
  });

  it("desktop: chips reveal on HOVER — row is a group, chips carry group-hover", () => {
    renderDraftRow();
    expect(screen.getByTestId("draft-row-rent").className).toContain("group");
    const chips = screen.getByTestId("draft-action-confirm").parentElement!;
    expect(chips.className).toContain("sm:group-hover:flex");
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

  it("double-click + edit + blur commits with new amount (no Enter required)", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    const amountCell = row.querySelector(".flex-1") as HTMLElement;
    fireEvent.doubleClick(amountCell);
    const input = row.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: "70" } });
    fireEvent.blur(input);
    expect(mockConfirmMutate).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "draft-1", amountOverride: 7000 }),
    );
  });

  it("Escape during edit + subsequent blur does NOT commit", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    const amountCell = row.querySelector(".flex-1") as HTMLElement;
    fireEvent.doubleClick(amountCell);
    const input = row.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "70" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(mockConfirmMutate).not.toHaveBeenCalled();
  });

  it("Enter with unchanged value does NOT confirm (draft stays pending)", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    const amountCell = row.querySelector(".flex-1") as HTMLElement;
    fireEvent.doubleClick(amountCell);
    const input = row.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    // Pre-filled with original "30" — submit unchanged.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockConfirmMutate).not.toHaveBeenCalled();
  });

  it("Blur with unchanged value does NOT confirm", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    const amountCell = row.querySelector(".flex-1") as HTMLElement;
    fireEvent.doubleClick(amountCell);
    const input = row.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    fireEvent.blur(input);
    expect(mockConfirmMutate).not.toHaveBeenCalled();
  });

  it("Enter commits, trailing blur does not double-fire mutation", () => {
    renderDraftRow();
    const row = screen.getByTestId("draft-row-rent");
    const amountCell = row.querySelector(".flex-1") as HTMLElement;
    fireEvent.doubleClick(amountCell);
    const input = row.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "55" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(mockConfirmMutate).toHaveBeenCalledTimes(1);
    expect(mockConfirmMutate).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "draft-1", amountOverride: 5500 }),
    );
  });
});
