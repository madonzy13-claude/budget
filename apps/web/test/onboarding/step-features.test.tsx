/**
 * step-features.test.tsx — the wizard cushion-target-months input.
 *
 * Regression (UAT): clearing the field coerced empty → 0, and a controlled
 * value={0} rendered a STUCK "0" that a typed digit turned into "03". The field
 * must render EMPTY when the value is 0 so it stays clearable.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { StepFeatures } from "@/components/onboarding/steps/step-features";

function renderStep(cushionTargetMonths: number, onChange = vi.fn()) {
  render(
    <StepFeatures
      cushionEnabled
      onChangeCushion={vi.fn()}
      reservesEnabled={false}
      onChangeReserves={vi.fn()}
      investmentsEnabled={false}
      onChangeInvestments={vi.fn()}
      cushionTargetMonths={cushionTargetMonths}
      onChangeCushionTargetMonths={onChange}
      pushEnabled={false}
      onChangePush={vi.fn()}
    />,
  );
  return document.getElementById(
    "onboarding-cushion-target-months",
  ) as HTMLInputElement;
}

describe("StepFeatures — cushion target months input", () => {
  it("renders EMPTY (not a stuck '0') when the value is 0", () => {
    const input = renderStep(0);
    expect(input.value).toBe("");
  });

  it("renders the number normally when non-zero", () => {
    const input = renderStep(3);
    expect(input.value).toBe("3");
  });

  it("clearing the field reports 0 (flagged invalid), no leading zero left behind", () => {
    const onChange = vi.fn();
    const input = renderStep(6, onChange);
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
