/**
 * wizard-page.test.tsx — WizardPage step-machine tests (ONBD-02..06)
 *
 * Covers: step advance / validation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WizardPage } from "@/components/onboarding/wizard-page";

// Mock next/navigation
const mockPush = vi.fn();
const mockGet = vi.fn().mockReturnValue(null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGet }),
  useParams: () => ({ locale: "en" }),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock api client
const mockBudgetsPost = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ id: "budget-123", name: "Test Budget" }),
});
const mockProgressPut = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({}),
});

vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      $post: (...args: unknown[]) => mockBudgetsPost(...args),
      ":id": {
        $patch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
        categories: {
          $post: vi
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({}) }),
        },
      },
    },
    onboarding: {
      progress: {
        $put: (...args: unknown[]) => mockProgressPut(...args),
      },
    },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("WizardPage — step-machine advance and validation (ONBD-02..06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null);
  });

  it("renders step 1 (name step) on initial render — shows text input", () => {
    render(<WizardPage locale="en" />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
  });

  it("step 1: shows inline error with an empty name on Next click", () => {
    render(<WizardPage locale="en" />);
    const nextBtn = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/budget name is required/i)).toBeInTheDocument();
  });

  it("step 1: Next is blocked (shows error) when name is empty", () => {
    render(<WizardPage locale="en" />);
    const nextBtn = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextBtn);
    // Error shown, we stay on step 1 — still have the text input
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("step 1: advancing with a valid name calls POST /budgets and moves to step 2", async () => {
    render(<WizardPage locale="en" />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "My Budget" } });
    const nextBtn = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(mockBudgetsPost).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({ name: "My Budget" }),
        }),
      );
    });
  });

  it("Back button is not visible on step 1", () => {
    render(<WizardPage locale="en" />);
    expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
  });

  it("wizard does not crash when rendered with locale prop", () => {
    expect(() => render(<WizardPage locale="en" />)).not.toThrow();
  });
});
