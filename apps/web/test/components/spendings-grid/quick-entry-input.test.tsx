/**
 * quick-entry-input.test.tsx — Vitest+RTL tests for QuickEntryInput component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickEntryInput } from "../../../src/components/budgeting/spendings-grid/quick-entry-input";
import { TestQueryProvider } from "../../setup/query-client";

const mockMutate = vi.fn();
vi.mock("../../../src/hooks/use-create-transaction", () => ({
  useCreateTransaction: () => ({ mutate: mockMutate }),
}));

const mockToast = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToast(...args) },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLocale: () => "en",
}));

const mockOnOfflineAttempt = vi.fn();

const defaultProps = {
  categoryId: "cat-1",
  categoryName: "Groceries",
  budgetId: "budget-1",
  month: "2026-05",
  budgetCurrency: "USD",
  resolvedDate: "2026-05-13",
  onOfflineAttempt: mockOnOfflineAttempt,
};

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

function renderInput(props = {}) {
  return render(
    <TestQueryProvider>
      <QuickEntryInput {...defaultProps} {...props} />
    </TestQueryProvider>,
  );
}

describe("QuickEntryInput", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockToast.mockClear();
    mockOnOfflineAttempt.mockClear();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it("has data-testid=quick-entry-groceries (lowercase categoryName)", () => {
    renderInput();
    expect(screen.getByTestId("quick-entry-groceries")).toBeTruthy();
  });

  it("has inputMode=decimal for mobile (D-PH4-Q2)", () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    expect(
      input.getAttribute("inputMode") ?? input.getAttribute("inputmode"),
    ).toBe("decimal");
  });

  it("accepts '5.96' and calls mutate with 596 cents on Enter", async () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "5.96");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 596 }),
    );
  });

  it("accepts '5,96' and calls mutate with 596 cents on Enter (D-PH4-Q2)", async () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "5,96");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 596 }),
    );
  });

  it("invalid '1.234' shows error toast and does NOT call mutate", async () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "1.234");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalled();
  });

  it("empty input on Enter does nothing", () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("Escape clears input", async () => {
    renderInput();
    const input = screen.getByTestId(
      "quick-entry-groceries",
    ) as HTMLInputElement;
    await userEvent.type(input, "5.96");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });

  it("uses resolvedDate prop as transaction date (past month)", async () => {
    renderInput({ resolvedDate: "2026-04-30" });
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "10");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-04-30" }),
    );
  });

  it("submits a valid amount on blur", async () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "12.50");
    fireEvent.blur(input);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1250 }),
    );
  });

  it("blur with an invalid value does NOT mutate and shows no toast", async () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "1.234");
    fireEvent.blur(input);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("blur with empty input does nothing", () => {
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    fireEvent.blur(input);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // 260615-bse: device-knows-offline path — pop the dialog BEFORE any insert
  // (no mutate → no optimistic row → no add-then-remove flicker).
  it("offline Enter: calls onOfflineAttempt, does NOT mutate, clears input", async () => {
    setOnline(false);
    renderInput();
    const input = screen.getByTestId(
      "quick-entry-groceries",
    ) as HTMLInputElement;
    await userEvent.type(input, "5.96");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockOnOfflineAttempt).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("offline blur: calls onOfflineAttempt and does NOT mutate", async () => {
    setOnline(false);
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "12.50");
    fireEvent.blur(input);
    expect(mockOnOfflineAttempt).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // r40 chaining: desktop chains via Enter — the save must never drop focus,
  // so the next amount can be typed straight away. On iOS the keyboard
  // cannot be kept across a save (focus() needs a page gesture, Done is
  // system UI); blur stays a plain save-and-close and no in-page button
  // exists (removed at the user's request).
  describe("chaining (r40)", () => {
    it("Enter saves, clears, and keeps focus for the next entry (desktop)", async () => {
      renderInput();
      const input = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      await userEvent.type(input, "5.96");
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: "Enter" });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 596 }),
      );
      expect(input.value).toBe("");
      // Focus retained → user types the next amount immediately.
      expect(document.activeElement).toBe(input);
      await userEvent.type(input, "7");
      expect(input.value).toBe("7");
    });

    it("renders no in-field save button", async () => {
      renderInput();
      const input = screen.getByTestId("quick-entry-groceries");
      await userEvent.type(input, "5.96");
      expect(screen.queryByTestId("quick-entry-groceries-next")).toBeNull();
    });

    it("blur (keyboard Done / tap away) saves WITHOUT refocusing", async () => {
      renderInput();
      const input = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      await userEvent.type(input, "12.50");
      act(() => input.blur());
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 1250 }),
      );
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
      expect(document.activeElement).not.toBe(input);
    });
  });

  // r40b: Left/Right move the caret until the field edge, then save + hop to the
  // adjacent column's quick input.
  describe("edge Left/Right column hop (r40b)", () => {
    function renderPair() {
      return render(
        <TestQueryProvider>
          <QuickEntryInput
            {...defaultProps}
            categoryId="cat-1"
            categoryName="Groceries"
          />
          <QuickEntryInput
            {...defaultProps}
            categoryId="cat-2"
            categoryName="Rent"
          />
        </TestQueryProvider>,
      );
    }

    it("ArrowRight at the right edge saves and focuses the next column", async () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      const second = screen.getByTestId("quick-entry-rent") as HTMLInputElement;
      await userEvent.type(first, "5.96"); // caret at end
      fireEvent.keyDown(first, { key: "ArrowRight" });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 596 }),
      );
      expect(document.activeElement).toBe(second);
    });

    it("ArrowLeft at the left edge saves and focuses the previous column", async () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      const second = screen.getByTestId("quick-entry-rent") as HTMLInputElement;
      await userEvent.type(second, "7");
      second.setSelectionRange(0, 0); // caret at left edge
      fireEvent.keyDown(second, { key: "ArrowLeft" });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 700 }),
      );
      expect(document.activeElement).toBe(first);
    });

    it("ArrowLeft with the caret mid-value moves the caret, does NOT save or hop", async () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      await userEvent.type(first, "50");
      first.setSelectionRange(1, 1); // between the two digits
      fireEvent.keyDown(first, { key: "ArrowLeft" });
      expect(mockMutate).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(first);
    });

    it("empty field hops columns without saving", async () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      const second = screen.getByTestId("quick-entry-rent") as HTMLInputElement;
      first.focus();
      fireEvent.keyDown(first, { key: "ArrowRight" });
      expect(mockMutate).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(second);
    });

    it("ArrowRight at the right edge of the LAST column WRAPS to the first", async () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      const second = screen.getByTestId("quick-entry-rent") as HTMLInputElement;
      await userEvent.type(second, "7"); // last column, caret at end
      fireEvent.keyDown(second, { key: "ArrowRight" });
      expect(document.activeElement).toBe(first); // wrapped
    });

    it("ArrowLeft at the left edge of the FIRST column WRAPS to the last", () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      const second = screen.getByTestId("quick-entry-rent") as HTMLInputElement;
      first.focus();
      first.setSelectionRange(0, 0);
      fireEvent.keyDown(first, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(second); // wrapped to last
    });

    it("Cmd+Right jumps to the LAST column's quick input (saving)", async () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      const second = screen.getByTestId("quick-entry-rent") as HTMLInputElement;
      await userEvent.type(first, "5.00");
      fireEvent.keyDown(first, { key: "ArrowRight", metaKey: true });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 500 }),
      );
      expect(document.activeElement).toBe(second);
    });

    it("Cmd+Left jumps to the FIRST column's quick input", () => {
      renderPair();
      const first = screen.getByTestId(
        "quick-entry-groceries",
      ) as HTMLInputElement;
      const second = screen.getByTestId("quick-entry-rent") as HTMLInputElement;
      second.focus();
      fireEvent.keyDown(second, { key: "ArrowLeft", ctrlKey: true });
      expect(document.activeElement).toBe(first);
    });
  });

  it("online Enter: mutates as before and does NOT call onOfflineAttempt", async () => {
    setOnline(true);
    renderInput();
    const input = screen.getByTestId("quick-entry-groceries");
    await userEvent.type(input, "5.96");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 596 }),
    );
    expect(mockOnOfflineAttempt).not.toHaveBeenCalled();
  });
});
