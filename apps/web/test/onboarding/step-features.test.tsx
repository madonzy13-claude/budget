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

const noop = {
  onChangeCushion: vi.fn(),
  onChangeReserves: vi.fn(),
  onChangeInvestments: vi.fn(),
  onChangeNotifications: vi.fn(),
  onChangeCushionTargetMonths: vi.fn(),
};

function renderStep(cushionTargetMonths: number, onChange = vi.fn()) {
  render(
    <StepFeatures
      cushionEnabled
      reservesEnabled={false}
      investmentsEnabled={false}
      notificationsEnabled={false}
      cushionTargetMonths={cushionTargetMonths}
      {...noop}
      onChangeCushionTargetMonths={onChange}
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

describe("StepFeatures — notifications toggle", () => {
  it("renders a notifications row and reports toggles (no separate badge row)", () => {
    const onChangeNotifications = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <StepFeatures
        cushionEnabled={false}
        reservesEnabled={false}
        investmentsEnabled={false}
        notificationsEnabled={false}
        cushionTargetMonths={6}
        {...noop}
        onChangeNotifications={onChangeNotifications}
      />,
    );
    const toggle = getByTestId("wizard-feature-notifications");
    expect(toggle).toBeTruthy();
    // Badge is enabled in the background — it must NOT appear as its own wizard row.
    expect(queryByTestId("wizard-feature-badge")).toBeNull();
    fireEvent.click(toggle);
    expect(onChangeNotifications).toHaveBeenCalledWith(true);
  });
});
