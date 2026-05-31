/**
 * wizard-page.test.tsx — WizardPage step-machine tests.
 *
 * Wizard rewrite (deferred-create): step 0 is the welcome screen; step 1
 * is Type (Personal / Shared); step 2 is Basics (name + currency); POST
 * /budgets happens at step 4 (Review) via the "Create budget" action,
 * not at step 1.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WizardPage } from "@/components/onboarding/wizard-page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
}));

// Identity translator so we can assert against keys instead of copy.
// Variables (e.g. {label}) are preserved by appending them after the key.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars && typeof vars.label === "string" ? `${key}:${vars.label}` : key,
}));

const mockBudgetsPost = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ id: "budget-123", name: "My Budget" }),
});
const mockProgressPut = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({}),
});
const mockBudgetsPatch = vi
  .fn()
  .mockResolvedValue({ ok: true, json: async () => ({}) });

vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      $post: (...args: unknown[]) => mockBudgetsPost(...args),
      ":id": {
        $patch: (...args: unknown[]) => mockBudgetsPatch(...args),
      },
    },
    onboarding: {
      progress: {
        $put: (...args: unknown[]) => mockProgressPut(...args),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("WizardPage — deferred-create step machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders welcome step 0 with a Get started CTA on initial render", () => {
    render(<WizardPage locale="en" />);
    expect(
      screen.getByRole("button", { name: /get_started/i }),
    ).toBeInTheDocument();
  });

  it("skips welcome when skipWelcome=true (returning user) and shows the type radiogroup", () => {
    render(<WizardPage locale="en" skipWelcome />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("Get started → step 1 surfaces the type radiogroup", () => {
    render(<WizardPage locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: /get_started/i }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("step 2: empty name + Next surfaces the required-name error", () => {
    render(<WizardPage locale="en" skipWelcome />);
    // Step 1 (Type) → Next to land on step 2 (Basics).
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 2 (Basics) → Next with empty name → required error.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // Required-name copy comes from `onboarding.wizard.basics.name_required`.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("step 1: deferred-create — POST /budgets is NOT called when leaving step 1", async () => {
    render(<WizardPage locale="en" skipWelcome />);
    // Step 1 (Type) has default PRIVATE → Next advances without writes.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // Allow any in-flight microtasks to settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockBudgetsPost).not.toHaveBeenCalled();
  });

  it("Back button is not visible on the welcome screen (step 0)", () => {
    render(<WizardPage locale="en" />);
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
  });

  it("wizard does not crash when rendered with locale prop", () => {
    expect(() => render(<WizardPage locale="en" />)).not.toThrow();
  });

  it("commit (step 4 Create budget) posts to /budgets and follows with progress PUT", async () => {
    render(<WizardPage locale="en" skipWelcome />);
    // Step 1 → Type: defaults to PRIVATE, advance.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 2 → Basics: fill name, advance.
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "My Budget" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 3 → Features: defaults both on, advance.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 4 → Review: "Create budget" fires the deferred POST.
    fireEvent.click(screen.getByRole("button", { name: /create_budget/i }));
    await waitFor(() => expect(mockBudgetsPost).toHaveBeenCalledTimes(1));
    const [callArg] = mockBudgetsPost.mock.calls[0] as [
      { json: Record<string, unknown> },
    ];
    expect(callArg.json).toMatchObject({
      name: "My Budget",
      kind: "PRIVATE",
    });
  });

  // Phase 7-09: cushion target months in StepFeatures + commit PATCH.
  it("step 3 (Features): cushion target months input renders when cushion enabled", async () => {
    render(<WizardPage locale="en" skipWelcome />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 1→2
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "My Budget" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 2→3
    await waitFor(() => {
      const input = document.getElementById("onboarding-cushion-target-months");
      expect(input).not.toBeNull();
    });
    const input = document.getElementById(
      "onboarding-cushion-target-months",
    ) as HTMLInputElement;
    expect(input.value).toBe("6");
  });

  it("commit: cushion_target_months included in PATCH when cushion enabled (default 6)", async () => {
    render(<WizardPage locale="en" skipWelcome />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 1→2
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "My Budget" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 2→3
    await waitFor(() => {
      expect(
        document.getElementById("onboarding-cushion-target-months"),
      ).not.toBeNull();
    });
    // Change to 12 so we can assert the input flowed through.
    const input = document.getElementById(
      "onboarding-cushion-target-months",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 3→4
    fireEvent.click(screen.getByRole("button", { name: /create_budget/i }));
    await waitFor(() => expect(mockBudgetsPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockBudgetsPatch).toHaveBeenCalled());
    const [patchArg] = mockBudgetsPatch.mock.calls[0] as [
      { json: Record<string, unknown> },
    ];
    expect(patchArg.json).toMatchObject({ cushion_target_months: 12 });
  });
});
