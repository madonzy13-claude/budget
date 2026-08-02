/**
 * segmented-toggle.test.tsx — the pill-track two-option switch (260802).
 *
 * The app already switches "Incl. contributions / Excl. contributions" this way;
 * this is that control, extracted so other pairs read the same.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

const options = [
  { value: "off", label: "Excl. ongoing month" },
  { value: "on", label: "Incl. ongoing month" },
] as const;

describe("SegmentedToggle", () => {
  it("marks the selected option and only that one", () => {
    render(
      <SegmentedToggle value="off" options={options} onChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: options[0].label }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: options[1].label }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the option the user picked", () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle value="off" options={options} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: options[1].label }));
    expect(onChange).toHaveBeenCalledWith("on");
  });

  it("says nothing when the selected option is clicked again", () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle value="off" options={options} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: options[0].label }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("carries a group label for screen readers", () => {
    render(
      <SegmentedToggle
        value="off"
        options={options}
        onChange={vi.fn()}
        label="Months averaged"
      />,
    );
    expect(screen.getByRole("group", { name: "Months averaged" })).toBeTruthy();
  });
});
