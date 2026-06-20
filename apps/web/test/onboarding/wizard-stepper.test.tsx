/**
 * wizard-stepper.test.tsx — WizardStepper component tests.
 *
 * Covers the 4 word-labeled stepper (Type / Basics / Features / Review).
 * The stepper opens at step 0 (welcome) so all segments render as
 * upcoming; steps 1..4 are real wizard steps.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardStepper } from "@/components/onboarding/wizard-stepper";

// Stepper labels come from `onboarding.wizard.stepper.*`. The mock
// translator returns the key itself so we can assert on stable names
// without depending on copy churn.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars && typeof vars.label === "string" ? `${key}:${vars.label}` : key,
}));

describe("WizardStepper — 4 word-labeled stepper states", () => {
  it("renders 4 segments with word labels", () => {
    render(<WizardStepper currentStep={1} />);
    expect(screen.getByText("basics")).toBeInTheDocument();
    expect(screen.getByText("type")).toBeInTheDocument();
    expect(screen.getByText("features")).toBeInTheDocument();
    expect(screen.getByText("review")).toBeInTheDocument();
  });

  it("active step carries data-current", () => {
    const { container } = render(<WizardStepper currentStep={2} />);
    const currentSegment = container.querySelector('[data-current="true"]');
    expect(currentSegment).not.toBeNull();
    expect(currentSegment?.getAttribute("data-step")).toBe("2");
  });

  it("step 1 is active on initial render when currentStep=1", () => {
    const { container } = render(<WizardStepper currentStep={1} />);
    const current = container.querySelector('[data-current="true"]');
    expect(current?.getAttribute("data-step")).toBe("1");
  });

  it("all steps before current are marked completed", () => {
    const { container } = render(<WizardStepper currentStep={4} />);
    const completed = container.querySelectorAll('[data-completed="true"]');
    expect(completed.length).toBe(3); // steps 1, 2, 3
  });

  it("upcoming steps carry data-upcoming", () => {
    const { container } = render(<WizardStepper currentStep={2} />);
    const upcoming = container.querySelectorAll('[data-upcoming="true"]');
    expect(upcoming.length).toBe(2); // steps 3 (features), 4 (review)
  });

  it("welcome (step 0) renders all four segments as upcoming", () => {
    const { container } = render(<WizardStepper currentStep={0} />);
    const upcoming = container.querySelectorAll('[data-upcoming="true"]');
    expect(upcoming.length).toBe(4);
    expect(container.querySelector('[data-current="true"]')).toBeNull();
    expect(container.querySelector('[data-completed="true"]')).toBeNull();
  });

  it("does not render a 'push' segment (push folded into Features)", () => {
    render(<WizardStepper currentStep={1} />);
    expect(screen.queryByText("push")).toBeNull();
  });
});
