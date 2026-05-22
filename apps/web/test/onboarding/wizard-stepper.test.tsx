/**
 * wizard-stepper.test.tsx — WizardStepper component tests (ONBD-07)
 *
 * Covers: numbered 1-5 stepper states (active, completed, upcoming)
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardStepper } from "@/components/onboarding/wizard-stepper";

describe("WizardStepper — numbered 1-5 stepper states (ONBD-07)", () => {
  it("renders 5 numbered steps", () => {
    render(<WizardStepper currentStep={1} />);
    // All 5 steps visible — completed show check, current+upcoming show number
    expect(screen.getByLabelText("Step 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 4")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 5")).toBeInTheDocument();
  });

  it("active step is visually highlighted with primary class", () => {
    const { container } = render(<WizardStepper currentStep={2} />);
    // The current step segment should have the data-current attribute
    const currentSegment = container.querySelector('[data-current="true"]');
    expect(currentSegment).not.toBeNull();
  });

  it("completed steps show a check indicator", () => {
    render(<WizardStepper currentStep={3} />);
    // Steps 1 and 2 are completed — they show check icons
    const checks = screen.getAllByLabelText(/completed/i);
    expect(checks.length).toBeGreaterThanOrEqual(2);
  });

  it("upcoming steps are visually dimmed (data-upcoming)", () => {
    const { container } = render(<WizardStepper currentStep={2} />);
    const upcoming = container.querySelectorAll('[data-upcoming="true"]');
    // Steps 3, 4, 5 should be upcoming
    expect(upcoming.length).toBe(3);
  });

  it("step 1 is active on initial render", () => {
    const { container } = render(<WizardStepper currentStep={1} />);
    const current = container.querySelector('[data-current="true"]');
    expect(current).not.toBeNull();
    expect(current?.getAttribute("data-step")).toBe("1");
  });

  it("all steps before current show as completed", () => {
    const { container } = render(<WizardStepper currentStep={4} />);
    const completed = container.querySelectorAll('[data-completed="true"]');
    expect(completed.length).toBe(3); // steps 1, 2, 3
  });
});
