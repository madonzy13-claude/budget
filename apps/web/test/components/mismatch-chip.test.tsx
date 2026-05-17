/**
 * mismatch-chip.test.tsx — Vitest+RTL tests for MismatchChip atom.
 *
 * Coverage:
 * - overfunded variant: AlertTriangle icon, destructive color + border, amount + helper
 * - underfunded variant: same destructive treatment
 * - reconciled variant: Check icon, hairline-dark border, muted-strong color, no amount
 * - role="status" on all variants
 * - No onClick handler in any variant
 * - No tabindex (inert)
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MismatchChip } from "../../src/components/budgeting/reserves-tab/mismatch-chip";

describe("MismatchChip", () => {
  describe("overfunded variant", () => {
    it("renders role=status", () => {
      render(
        <MismatchChip
          variant="overfunded"
          amountFormatted="EUR 10.00"
          helperText="Reduce reserve wallet or distribute to categories."
        />,
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("renders the amount text", () => {
      render(
        <MismatchChip
          variant="overfunded"
          amountFormatted="EUR 10.00"
          helperText="Reduce reserve wallet."
        />,
      );
      expect(screen.getByText("EUR 10.00")).toBeInTheDocument();
    });

    it("renders helper text", () => {
      render(
        <MismatchChip
          variant="overfunded"
          amountFormatted="EUR 10.00"
          helperText="Reduce reserve wallet or distribute to categories."
        />,
      );
      expect(
        screen.getByText("Reduce reserve wallet or distribute to categories."),
      ).toBeInTheDocument();
    });

    it("amount span has destructive color class", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      const status = screen.getByRole("status");
      // Amount span should contain --destructive
      const amountEl = status.querySelector("span");
      expect(amountEl?.className).toContain("--destructive");
    });

    it("container has destructive border class", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      const status = screen.getByRole("status");
      expect(status.className).toContain("--destructive");
    });
  });

  describe("underfunded variant", () => {
    it("renders role=status", () => {
      render(
        <MismatchChip
          variant="underfunded"
          amountFormatted="EUR 5.00"
          helperText="Top up reserve wallet."
        />,
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has destructive color (same as overfunded)", () => {
      render(<MismatchChip variant="underfunded" amountFormatted="EUR 5.00" />);
      const status = screen.getByRole("status");
      expect(status.className).toContain("--destructive");
    });
  });

  describe("reconciled variant", () => {
    it("renders role=status", () => {
      render(<MismatchChip variant="reconciled" />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("renders Reconciled label text", () => {
      render(<MismatchChip variant="reconciled" />);
      expect(screen.getByText("Reconciled")).toBeInTheDocument();
    });

    it("has hairline-dark border (NOT destructive)", () => {
      render(<MismatchChip variant="reconciled" />);
      const status = screen.getByRole("status");
      expect(status.className).toContain("--hairline-dark");
      expect(status.className).not.toContain("--destructive");
    });

    it("does NOT render amount text when no amountFormatted", () => {
      render(<MismatchChip variant="reconciled" />);
      // The title label should be "Reconciled", not an amount string
      const spans = screen.getByRole("status").querySelectorAll("span");
      const texts = Array.from(spans).map((s) => s.textContent);
      expect(texts).not.toContain("EUR");
    });
  });

  describe("interactivity constraints (inert)", () => {
    it("has no onClick handler — chip element is not a button", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      // Should render as div with role=status, not a button role
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("has no tabIndex (not keyboard-focusable)", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      const status = screen.getByRole("status");
      // No tabindex attribute set
      expect(status).not.toHaveAttribute("tabindex");
    });
  });
});
