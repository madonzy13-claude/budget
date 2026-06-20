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

import { CategorySlider } from "@/components/budgeting/category-slider";

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

  it("currency for planned + cushion is fixed to budgetCurrency (no picker)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // Should show USD badge(s) but no currency select/picker
    const currencyBadges = document.querySelectorAll(
      "[data-testid='currency-badge']",
    );
    expect(currencyBadges.length).toBeGreaterThanOrEqual(1);
    // No currency picker select for planned/cushion
    const currencyPicker = document.querySelector(
      "[data-testid='currency-picker']",
    );
    expect(currencyPicker).toBeNull();
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
    const planned = document.querySelector(
      "#cat-slider-planned",
    ) as HTMLInputElement;
    await user.clear(planned);
    await user.type(planned, "100");
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
    const cushion = document.querySelector(
      "#cat-slider-cushion",
    ) as HTMLInputElement;
    await user.clear(cushion);
    await user.type(cushion, "50");
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

  it("edit mode: planned amount is prefilled (10000 cents → 100, bare format)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    const plannedInput = document.getElementById(
      "cat-slider-planned",
    ) as HTMLInputElement;
    expect(plannedInput).toBeTruthy();
    expect(plannedInput.value).toBe("100");
  });

  it("edit mode: cushion amount is prefilled (2000 cents → 20, bare format)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    const cushionInput = document.getElementById(
      "cat-slider-cushion",
    ) as HTMLInputElement;
    expect(cushionInput).toBeTruthy();
    expect(cushionInput.value).toBe("20");
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
    const plannedInput = document.getElementById(
      "cat-slider-planned",
    ) as HTMLInputElement;
    expect(plannedInput?.value).toBe("50");
  });

  // ── Phase 7-09 (D-PH7-35..37): silent cushion-mirror ───────────────
  describe("CategorySlider cushion mirror (D-PH7-35..37)", () => {
    const linkedProps = {
      ...defaultProps,
      mode: "edit" as const,
      initial: {
        categoryId: "cat-linked",
        name: "Linked",
        plannedCents: "10000",
        cushionCents: "10000",
        iconKey: null,
        colorKey: null,
      },
    };
    const linkedNullProps = {
      ...defaultProps,
      mode: "edit" as const,
      initial: {
        categoryId: "cat-null-cushion",
        name: "Null cushion",
        plannedCents: "10000",
        cushionCents: "",
        iconKey: null,
        colorKey: null,
      },
    };
    const unlinkedProps = {
      ...defaultProps,
      mode: "edit" as const,
      initial: {
        categoryId: "cat-unlinked",
        name: "Unlinked",
        plannedCents: "10000",
        cushionCents: "5000",
        iconKey: null,
        colorKey: null,
      },
    };

    it("linked=true when initial.cushionCents is empty/null → typing planned mirrors cushion", async () => {
      const user = userEvent.setup();
      render(
        <TestQueryProvider>
          <CategorySlider {...linkedNullProps} />
        </TestQueryProvider>,
      );
      const planned = document.getElementById(
        "cat-slider-planned",
      ) as HTMLInputElement;
      const cushion = document.getElementById(
        "cat-slider-cushion",
      ) as HTMLInputElement;
      await user.clear(planned);
      await user.type(planned, "250");
      expect(cushion.value).toBe("250");
    });

    it("linked=true when initial cushion === planned → typing planned mirrors cushion", async () => {
      const user = userEvent.setup();
      render(
        <TestQueryProvider>
          <CategorySlider {...linkedProps} />
        </TestQueryProvider>,
      );
      const planned = document.getElementById(
        "cat-slider-planned",
      ) as HTMLInputElement;
      const cushion = document.getElementById(
        "cat-slider-cushion",
      ) as HTMLInputElement;
      await user.clear(planned);
      await user.type(planned, "300");
      expect(cushion.value).toBe("300");
    });

    it("linked=false when initial cushion !== planned → typing planned does NOT mirror", async () => {
      const user = userEvent.setup();
      render(
        <TestQueryProvider>
          <CategorySlider {...unlinkedProps} />
        </TestQueryProvider>,
      );
      const planned = document.getElementById(
        "cat-slider-planned",
      ) as HTMLInputElement;
      const cushion = document.getElementById(
        "cat-slider-cushion",
      ) as HTMLInputElement;
      // initial cushion is 5000 cents → bare "50"
      expect(cushion.value).toBe("50");
      await user.clear(planned);
      await user.type(planned, "200");
      // unchanged — link broken from start
      expect(cushion.value).toBe("50");
    });

    it("typing cushion silently breaks link → subsequent planned change does not mirror", async () => {
      const user = userEvent.setup();
      render(
        <TestQueryProvider>
          <CategorySlider {...linkedNullProps} />
        </TestQueryProvider>,
      );
      const planned = document.getElementById(
        "cat-slider-planned",
      ) as HTMLInputElement;
      const cushion = document.getElementById(
        "cat-slider-cushion",
      ) as HTMLInputElement;
      // First: change cushion → breaks link
      await user.clear(cushion);
      await user.type(cushion, "75");
      expect(cushion.value).toBe("75");
      // Now change planned → should NOT mirror
      await user.clear(planned);
      await user.type(planned, "200");
      expect(cushion.value).toBe("75");
    });

    it("renders no chain icon / no relink affordance", () => {
      render(
        <TestQueryProvider>
          <CategorySlider {...linkedProps} />
        </TestQueryProvider>,
      );
      // No button labeled link/unlink/chain
      expect(
        screen.queryByRole("button", { name: /chain|link|unlink|relink/i }),
      ).toBeNull();
    });

    it("slider reopen with equal values re-links (mirror behavior restored)", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <TestQueryProvider>
          <CategorySlider {...unlinkedProps} open={false} />
        </TestQueryProvider>,
      );
      const newInitial = {
        categoryId: "cat-relinked",
        name: "Relinked",
        plannedCents: "20000",
        cushionCents: "20000",
        iconKey: null,
        colorKey: null,
      };
      rerender(
        <TestQueryProvider>
          <CategorySlider {...unlinkedProps} open={true} initial={newInitial} />
        </TestQueryProvider>,
      );
      const planned = document.getElementById(
        "cat-slider-planned",
      ) as HTMLInputElement;
      const cushion = document.getElementById(
        "cat-slider-cushion",
      ) as HTMLInputElement;
      // Initial: both 200
      expect(planned.value).toBe("200");
      expect(cushion.value).toBe("200");
      await user.clear(planned);
      await user.type(planned, "300");
      expect(cushion.value).toBe("300");
    });
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
});
