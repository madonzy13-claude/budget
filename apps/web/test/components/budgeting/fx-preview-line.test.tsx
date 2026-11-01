/**
 * fx-preview-line.test.tsx — R6 (user): the Edit form's info line reads in
 * plain words: a trimmed rate and a friendly date, not "4.36910000 (2026-10-15)".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FxPreviewLine } from "../../../src/components/budgeting/fields/fx-preview-line";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));

describe("FxPreviewLine", () => {
  it("trims the rate and writes the date for people", () => {
    render(
      <FxPreviewLine
        original={{ amount: "10", currency: "EUR" }}
        converted={{ amount: "43.69", currency: "PLN" }}
        rate="4.36910000"
        asOf="2026-10-15"
      />,
    );
    const line = screen.getByTestId("fx-preview-line");
    expect(line).toHaveTextContent("@ 4.3691");
    expect(line).not.toHaveTextContent("4.36910000");
    expect(line).not.toHaveTextContent("2026-10-15");
    expect(line).toHaveTextContent("15 Oct 2026");
  });
});
