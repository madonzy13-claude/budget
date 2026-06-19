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

// Push subscribe helper — onboarding acts on the Features push toggle at commit.
const mockSubscribeToPush = vi.fn().mockResolvedValue("subscribed");
vi.mock("@/lib/push-subscribe", () => ({
  subscribeToPushForBudget: (...args: unknown[]) =>
    mockSubscribeToPush(...args),
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
    // Step 3 → Features (now incl. push) → 4 Review.
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

  // Test 9 (Onboarding Push Step) — 260618 UAT redesign: push is FOLDED INTO
  // the Features step (no standalone Push step), and there is NO Skip button
  // anywhere. Completing the wizard lands on /budgets/:id/spendings.
  async function advanceToFeaturesStep() {
    render(<WizardPage locale="en" skipWelcome />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 1 Type → 2
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "My Budget" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 2 Basics → 3 Features
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-push-switch")).toBeInTheDocument(),
    );
  }

  it("features step (3) carries the push switch alongside cushion + reserves", async () => {
    await advanceToFeaturesStep();
    expect(screen.getByTestId("onboarding-push-switch")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-feature-cushion")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-feature-reserves")).toBeInTheDocument();
  });

  it("renders no Skip button on any step (skip removed)", async () => {
    await advanceToFeaturesStep();
    expect(screen.queryByRole("button", { name: /^skip$/i })).toBeNull();
  });

  it("enabling push on Features subscribes the new budget at commit", async () => {
    const assignSpy = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => {});
    await advanceToFeaturesStep();
    // Turn the push toggle ON.
    fireEvent.click(screen.getByTestId("onboarding-push-switch"));
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 3 → 4 Review
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /create_budget/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /create_budget/i }));
    await waitFor(() => expect(mockBudgetsPost).toHaveBeenCalledTimes(1));
    // Push opt-in is HONORED: the new budget id is subscribed.
    await waitFor(() =>
      expect(mockSubscribeToPush).toHaveBeenCalledWith("budget-123"),
    );
    assignSpy.mockRestore();
  });

  it("NOT enabling push → no subscribe call at commit", async () => {
    const assignSpy = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => {});
    await advanceToFeaturesStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 3 → 4 Review
    fireEvent.click(screen.getByRole("button", { name: /create_budget/i }));
    await waitFor(() => expect(mockBudgetsPost).toHaveBeenCalledTimes(1));
    expect(mockSubscribeToPush).not.toHaveBeenCalled();
    assignSpy.mockRestore();
  });

  it("completing from the features step lands on /budgets/:id/spendings", async () => {
    const assignSpy = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => {});
    await advanceToFeaturesStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 3 Features → 4 Review
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /create_budget/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /create_budget/i }));
    await waitFor(() => expect(mockBudgetsPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockProgressPut).toHaveBeenCalled());
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith(
        "/en/budgets/budget-123/spendings",
      ),
    );
    assignSpy.mockRestore();
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
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // 3 Features→4 Review
    fireEvent.click(screen.getByRole("button", { name: /create_budget/i }));
    await waitFor(() => expect(mockBudgetsPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockBudgetsPatch).toHaveBeenCalled());
    const [patchArg] = mockBudgetsPatch.mock.calls[0] as [
      { json: Record<string, unknown> },
    ];
    expect(patchArg.json).toMatchObject({ cushion_target_months: 12 });
  });
});
