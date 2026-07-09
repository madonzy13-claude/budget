/**
 * category-slider.test.tsx — Vitest+RTL tests for CategorySlider.
 * TDD RED: write tests before implementation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TestQueryProvider,
  makeTestQueryClient,
} from "../../setup/query-client";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import {
  CategorySlider,
  computeSliderAmounts,
} from "@/components/budgeting/category-slider";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  mode: "create" as const,
  budgetId: "budget-1",
  budgetCurrency: "USD",
};

const editProps = {
  ...defaultProps,
  mode: "edit" as const,
  initial: {
    categoryId: "cat-1",
    name: "Groceries",
    plannedCents: "10000",
    cushionCents: "2000",
    iconKey: null,
    colorKey: null,
  },
  txnsCount: 0,
};

describe("CategorySlider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ category: { id: "cat-new" } }),
    });
  });

  it("create mode: 'New category' header (catSlider.header.create)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // mock returns key without namespace prefix
    expect(screen.getByText("catSlider.header.create")).toBeTruthy();
  });

  it("edit mode: 'Edit category' header (catSlider.header.edit)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    expect(screen.getByText("catSlider.header.edit")).toBeTruthy();
  });

  // 260613-v1p: the icon picker is REMOVED — no icon label, no icon buttons.
  it("does NOT render the icon picker (removed in 260613-v1p)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    expect(screen.queryByText("catSlider.field.icon")).toBeNull();
    const iconButtons = document.querySelectorAll(
      "[data-testid^='icon-option-']",
    );
    expect(iconButtons.length).toBe(0);
  });

  it("color picker shows color swatches (8 colors)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    const colorLabel = screen.queryByText("catSlider.field.color");
    expect(colorLabel).toBeTruthy();
    const colorButtons = document.querySelectorAll(
      "[data-testid^='color-option-']",
    );
    expect(colorButtons.length).toBeGreaterThanOrEqual(8);
  });

  it("planned shows a fixed-currency amount with a short currency sign (no picker)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // The planned total renders as a currency-formatted amount (symbol), not a
    // typed field — and there is no currency picker.
    const readout = document.querySelector(
      "[data-testid='cat-slider-planned-readout']",
    ) as HTMLElement;
    expect(readout).toBeTruthy();
    expect(readout.textContent).toContain("$");
    expect(
      document.querySelector("[data-testid='currency-picker']"),
    ).toBeNull();
  });

  it("create flow: limits POST sends amounts as digit strings (setLimitSchema expects z.string)", async () => {
    const user = userEvent.setup();
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    await user.type(
      document.querySelector("#cat-slider-name") as HTMLElement,
      "Travel",
    );
    // Create mode builds Planned from Needs + Wants (no single planned input).
    const needs = document.querySelector(
      "#cat-slider-needs",
    ) as HTMLInputElement;
    await user.clear(needs);
    await user.type(needs, "100");
    const saveBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("catSlider.cta.create"))!;
    await user.click(saveBtn);

    await waitFor(() => {
      const limitsCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/limits"),
      );
      expect(limitsCall).toBeTruthy();
    });
    const limitsCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/limits"),
    )!;
    const body = JSON.parse((limitsCall[1] as { body: string }).body);
    expect(typeof body.normalAmount).toBe("string");
    expect(body.normalAmount).toMatch(/^\d+$/);
    expect(typeof body.cushionAmount).toBe("string");
    expect(body.cushionAmount).toMatch(/^\d+$/);
    // effectiveFrom must anchor to the first of the month so the limit is
    // visible in the current month's spendings-summary.
    expect(body.effectiveFrom).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("edit flow: saving a limit change invalidates the pending-tasks query (cushion task badge refresh)", async () => {
    // Changing a category's cushion limit can resolve/raise the
    // CUSHION_BELOW_TARGET task server-side, so the ["tasks", budgetId,
    // "pending"] query must be invalidated → the badge refreshes in the
    // background instead of staying stale until a page reload.
    const user = userEvent.setup();
    const client = makeTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    render(
      <TestQueryProvider client={client}>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    // Any successful save invalidates the pending-tasks query. Edit mode now
    // prefills the fields, so just save.
    const saveBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("catSlider.cta.save"))!;
    await user.click(saveBtn);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["tasks", "budget-1", "pending"],
        }),
      );
    });
  });

  it("validation: name required; save button present", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // Name field should be present
    expect(screen.getByText("catSlider.field.name")).toBeTruthy();
    // Save button present
    const saveBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("catSlider.cta.create"));
    expect(saveBtn).toBeTruthy();
  });

  it("edit mode: Delete button visible when txnsCount === 0", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} txnsCount={0} />
      </TestQueryProvider>,
    );
    const deleteBtn = document.querySelector(
      "[data-testid='cat-slider-delete']",
    );
    expect(deleteBtn).toBeTruthy();
  });

  it("edit mode: Delete button enabled even when txnsCount > 0 (archive keeps history)", () => {
    // The delete flow now archives (soft-delete) and preserves transactions in
    // both modes, so it is no longer blocked by transaction count — the button
    // stays available regardless of how many transactions the category has.
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} txnsCount={5} />
      </TestQueryProvider>,
    );
    const deleteBtn = document.querySelector(
      "[data-testid='cat-slider-delete']",
    ) as HTMLButtonElement | null;
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn!.disabled).toBe(false);
    expect(deleteBtn!.getAttribute("aria-disabled")).not.toBe("true");
  });

  // ── UAT Defect 2: create response parsing ────────────────────────────
  it("create: calls POST /budgets/:id/categories then POST limits, closes slider on success", async () => {
    const onOpenChange = vi.fn();
    // First call: POST /categories → { category: { id } }
    // Second call: POST /categories/:id/limits → ok
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ category: { id: "cat-new-123" } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} onOpenChange={onOpenChange} />
      </TestQueryProvider>,
    );

    // Fill name
    const nameInput = document.getElementById(
      "cat-slider-name",
    ) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Groceries");

    // Submit
    const saveBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("catSlider.cta.create"))!;
    await user.click(saveBtn);

    // POST /categories called with correct path
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/budgets/budget-1/categories`),
      expect.objectContaining({ method: "POST" }),
    );
    // 260613-v1p: the create payload carries colorKey and does NOT carry iconKey.
    const createCall = fetchMock.mock.calls.find(
      (c) =>
        String(c[0]).endsWith("/categories") &&
        (c[1] as RequestInit)?.method === "POST",
    )!;
    const createBody = JSON.parse(
      (createCall[1] as RequestInit).body as string,
    );
    expect(createBody).toHaveProperty("colorKey");
    expect(createBody).not.toHaveProperty("iconKey");
    // POST limits called with the id from the response
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("cat-new-123/limits"),
      expect.objectContaining({ method: "POST" }),
    );
    // Slider closes on success
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("create: if API returns flat DTO (missing category wrapper) does NOT crash", async () => {
    // Guard: even if server accidentally returns flat DTO, no TypeError thrown
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const onOpenChange = vi.fn();
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} onOpenChange={onOpenChange} />
      </TestQueryProvider>,
    );

    const nameInput = document.getElementById(
      "cat-slider-name",
    ) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Test");
    const saveBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("catSlider.cta.create"))!;
    // Should not throw — toast.error called instead
    await user.click(saveBtn);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  // ── UAT Defect 3: edit mode prefill ─────────────────────────────────
  it("edit mode: name input is prefilled from initial prop", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    const nameInput = document.getElementById(
      "cat-slider-name",
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    expect(nameInput.value).toBe("Groceries");
  });

  it("edit mode: planned prefills the Needs input (10000 cents → 100)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    const needs = document.getElementById(
      "cat-slider-needs",
    ) as HTMLInputElement;
    expect(needs).toBeTruthy();
    expect(needs.value).toBe("100");
  });

  it("edit mode: a cushion ≠ planned prefills Custom mode with the amount (2000 → 20)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    // 2000 cushion ≠ 10000 planned → Custom, prefilled with the bare amount.
    const custom = document.getElementById(
      "cat-slider-cushion-custom",
    ) as HTMLInputElement;
    expect(custom).toBeTruthy();
    expect(custom.value).toBe("20");
  });

  it("edit mode: saving with prefilled decimal amounts submits PATCH + limits (schema accepts decimals)", async () => {
    // Regression: centsToDecimal prefills planned/cushion as "100.00"/"20.00".
    // The form schema must accept those decimal strings — an integer-only
    // regex blocks zodResolver, handleSubmit never fires, and the slider
    // silently stays open with no network request.
    const onOpenChange = vi.fn();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // PATCH
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // POST limits

    const user = userEvent.setup();
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} onOpenChange={onOpenChange} />
      </TestQueryProvider>,
    );

    const saveBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("catSlider.cta.save"))!;
    await user.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/budgets/budget-1/categories/cat-1`),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    const limitsCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("cat-1/limits"),
    )!;
    expect(limitsCall).toBeTruthy();
    const body = JSON.parse((limitsCall[1] as { body: string }).body);
    expect(body.normalAmount).toBe("10000");
    expect(body.cushionAmount).toBe("2000");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("edit mode: re-opening with different category resets form to new values", async () => {
    const { rerender } = render(
      <TestQueryProvider>
        <CategorySlider {...editProps} open={false} />
      </TestQueryProvider>,
    );

    const newInitial = {
      categoryId: "cat-2",
      name: "Transport",
      plannedCents: "5000",
      cushionCents: "1000",
      iconKey: null,
      colorKey: null,
    };

    rerender(
      <TestQueryProvider>
        <CategorySlider {...editProps} open={true} initial={newInitial} />
      </TestQueryProvider>,
    );

    const nameInput = document.getElementById(
      "cat-slider-name",
    ) as HTMLInputElement;
    expect(nameInput?.value).toBe("Transport");
    const needs = document.getElementById(
      "cat-slider-needs",
    ) as HTMLInputElement;
    expect(needs?.value).toBe("50");
  });

  // ── UAT round 14: delete must hit the backend's archive endpoint ─────
  // The backend exposes POST /budgets/:id/categories/:cid/archive — there
  // is NO DELETE route. Earlier the slider called fetch(..., {method:
  // "DELETE"}) which silently 404'd; the AlertDialog closed but the
  // category never disappeared from the grid.
  describe("delete action wires to backend /archive (UAT round 14)", () => {
    it("calls POST /budgets/:id/categories/:cid/archive when Confirm is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      render(
        <TestQueryProvider>
          <CategorySlider {...editProps} onOpenChange={onOpenChange} />
        </TestQueryProvider>,
      );

      // Open the AlertDialog
      const deleteBtn = document.querySelector(
        "[data-testid='cat-slider-delete']",
      ) as HTMLButtonElement;
      expect(deleteBtn).toBeTruthy();
      await user.click(deleteBtn);

      // Confirm in the AlertDialog — the delete dialog now offers two archive
      // modes; "keep history" (current_future) is the POST /archive path.
      const confirmBtn = (await screen.findByTestId(
        "cat-remove-keep-history",
      )) as HTMLButtonElement;
      await user.click(confirmBtn);

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      // The request must target the archive endpoint with POST. DELETE
      // 404s on the backend, leaving the category orphaned.
      expect(fetchMock).toHaveBeenCalledWith(
        `/budgets/budget-1/categories/cat-1/archive`,
        expect.objectContaining({ method: "POST" }),
      );
      // Slider closes on success
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });
  });

  // ── r32: create-mode Needs + Wants → Planned + cushion mode selector ──
  describe("computeSliderAmounts", () => {
    const base = { needs: "100", wants: "50", custom: "7" };
    it("planned = needs + wants (cents); cushion follows the mode", () => {
      expect(computeSliderAmounts({ ...base, cushionMode: "none" })).toEqual({
        normalAmount: "15000",
        cushionAmount: "0",
      });
      expect(
        computeSliderAmounts({ ...base, cushionMode: "needs_wants" }),
      ).toEqual({ normalAmount: "15000", cushionAmount: "15000" });
      expect(
        computeSliderAmounts({ ...base, cushionMode: "needs_only" }),
      ).toEqual({ normalAmount: "15000", cushionAmount: "10000" });
      expect(computeSliderAmounts({ ...base, cushionMode: "custom" })).toEqual({
        normalAmount: "15000",
        cushionAmount: "700",
      });
    });
    it("empty needs/wants → zero; decimals kept to the cent", () => {
      expect(
        computeSliderAmounts({
          needs: "",
          wants: "",
          custom: "",
          cushionMode: "needs_wants",
        }),
      ).toEqual({ normalAmount: "0", cushionAmount: "0" });
      expect(
        computeSliderAmounts({
          needs: "10.50",
          wants: "0.25",
          custom: "",
          cushionMode: "needs_only",
        }),
      ).toEqual({ normalAmount: "1075", cushionAmount: "1050" });
    });
  });

  describe("create mode: Needs + Wants + cushion mode UI", () => {
    it("renders Needs, Wants, a Planned readout and the 4 cushion modes; no single planned input", () => {
      render(
        <TestQueryProvider>
          <CategorySlider {...defaultProps} />
        </TestQueryProvider>,
      );
      expect(document.querySelector("#cat-slider-needs")).toBeTruthy();
      expect(document.querySelector("#cat-slider-wants")).toBeTruthy();
      expect(
        document.querySelector("[data-testid='cat-slider-planned-readout']"),
      ).toBeTruthy();
      for (const m of ["none", "needs_wants", "needs_only", "custom"]) {
        expect(
          document.querySelector(`[data-testid='cushion-mode-${m}']`),
        ).toBeTruthy();
      }
      // The old single planned/cushion inputs are gone in create mode.
      expect(document.querySelector("#cat-slider-planned")).toBeNull();
      expect(document.querySelector("#cat-slider-cushion")).toBeNull();
    });

    it("Planned readout is the live sum of Needs + Wants", async () => {
      const user = userEvent.setup();
      render(
        <TestQueryProvider>
          <CategorySlider {...defaultProps} />
        </TestQueryProvider>,
      );
      await user.type(
        document.querySelector("#cat-slider-needs") as HTMLElement,
        "100",
      );
      await user.type(
        document.querySelector("#cat-slider-wants") as HTMLElement,
        "50",
      );
      const readout = document.querySelector(
        "[data-testid='cat-slider-planned-readout']",
      ) as HTMLElement;
      expect(readout.textContent).toContain("150");
    });

    async function submitCreate(
      clickMode: string | null,
      opts: { needs?: string; wants?: string; custom?: string } = {},
    ) {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ category: { id: "cat-x" } }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      render(
        <TestQueryProvider>
          <CategorySlider {...defaultProps} onOpenChange={onOpenChange} />
        </TestQueryProvider>,
      );
      await user.type(
        document.querySelector("#cat-slider-name") as HTMLElement,
        "Food",
      );
      await user.type(
        document.querySelector("#cat-slider-needs") as HTMLElement,
        opts.needs ?? "100",
      );
      if (opts.wants) {
        await user.type(
          document.querySelector("#cat-slider-wants") as HTMLElement,
          opts.wants,
        );
      }
      if (clickMode) {
        await user.click(
          document.querySelector(
            `[data-testid='cushion-mode-${clickMode}']`,
          ) as HTMLElement,
        );
      }
      if (opts.custom) {
        await user.type(
          document.querySelector("#cat-slider-cushion-custom") as HTMLElement,
          opts.custom,
        );
      }
      await user.click(
        screen
          .getAllByRole("button")
          .find((b) => b.textContent?.includes("catSlider.cta.create"))!,
      );
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.find((c) => String(c[0]).includes("/limits")),
        ).toBeTruthy(),
      );
      const limitsCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/limits"),
      )!;
      return JSON.parse((limitsCall[1] as { body: string }).body);
    }

    it("default cushion mode is None → cushionAmount 0", async () => {
      const body = await submitCreate(null);
      expect(body.normalAmount).toBe("10000");
      expect(body.cushionAmount).toBe("0");
    });

    it("cushion mode Needs + Wants → cushionAmount = planned", async () => {
      const body = await submitCreate("needs_wants", {
        needs: "100",
        wants: "50",
      });
      expect(body.normalAmount).toBe("15000");
      expect(body.cushionAmount).toBe("15000");
    });

    it("cushion mode Needs only → cushionAmount = needs", async () => {
      const body = await submitCreate("needs_only", {
        needs: "100",
        wants: "50",
      });
      expect(body.normalAmount).toBe("15000");
      expect(body.cushionAmount).toBe("10000");
    });

    it("cushion mode Custom → reveals an input, submits its value", async () => {
      const body = await submitCreate("custom", { needs: "100", custom: "7" });
      expect(body.normalAmount).toBe("10000");
      expect(body.cushionAmount).toBe("700");
    });
  });
});
