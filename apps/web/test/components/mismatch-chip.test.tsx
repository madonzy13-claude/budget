/**
 * mismatch-chip.test.tsx — Vitest+RTL tests for MismatchChip atom.
 *
 * Updated for UAT-PH5-T3-56: variants use distinct colors.
 *   - overfunded → --warning border/icon/amount, "+{amount}" prefix
 *   - underfunded → --destructive border/icon/amount, "−{amount}" prefix
 *   - reconciled → --hairline-dark border, --muted-strong amount
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MismatchChip } from "../../src/components/budgeting/reserves-tab/mismatch-chip";

// MismatchChip now reads the "reconciled" label via next-intl. The mock
// returns `ns.key` (no params) or `ns.key:vars-JSON` (with params), matching
// the convention used across the reserves-tab tests.
vi.mock("next-intl", () => ({
  useTranslations:
    (ns?: string) => (key: string, vars?: Record<string, unknown>) =>
      vars
        ? `${ns ? `${ns}.` : ""}${key}:${JSON.stringify(vars)}`
        : `${ns ? `${ns}.` : ""}${key}`,
}));

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

    it("renders the amount with '+' sign prefix", () => {
      render(
        <MismatchChip
          variant="overfunded"
          amountFormatted="EUR 10.00"
          helperText="Reduce reserve wallet."
        />,
      );
      expect(screen.getByText("+EUR 10.00")).toBeInTheDocument();
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

    it("amount span uses --warning color via inline style", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      const status = screen.getByRole("status");
      const amountEl = status.querySelector("span");
      expect(amountEl?.getAttribute("style")).toContain("--warning");
    });

    it("container has warning border class", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      const status = screen.getByRole("status");
      expect(status.className).toContain("--warning");
      expect(status.className).not.toContain("--destructive");
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

    it("renders the amount with '−' sign prefix", () => {
      render(<MismatchChip variant="underfunded" amountFormatted="EUR 5.00" />);
      expect(screen.getByText("−EUR 5.00")).toBeInTheDocument();
    });

    it("container has destructive border (distinct from overfunded)", () => {
      render(<MismatchChip variant="underfunded" amountFormatted="EUR 5.00" />);
      const status = screen.getByRole("status");
      expect(status.className).toContain("--destructive");
      expect(status.className).not.toContain("--warning");
    });
  });

  describe("reconciled variant", () => {
    it("renders role=status", () => {
      render(<MismatchChip variant="reconciled" />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("renders Reconciled label text", () => {
      render(<MismatchChip variant="reconciled" />);
      // The chip now reads the reconciled title from i18n; the test mock
      // round-trips the key as `<namespace>.<key>`.
      expect(
        screen.getByText("bdp.tab.reserves.mismatch.reconciled.title"),
      ).toBeInTheDocument();
    });

    it("has hairline-dark border (no warning / destructive)", () => {
      render(<MismatchChip variant="reconciled" />);
      const status = screen.getByRole("status");
      expect(status.className).toContain("--hairline-dark");
      expect(status.className).not.toContain("--destructive");
      expect(status.className).not.toContain("--warning");
    });

    it("does NOT render amount text when no amountFormatted", () => {
      render(<MismatchChip variant="reconciled" />);
      const spans = screen.getByRole("status").querySelectorAll("span");
      const texts = Array.from(spans).map((s) => s.textContent);
      expect(texts).not.toContain("EUR");
    });
  });

  describe("interactivity constraints (inert)", () => {
    it("has no onClick handler — chip element is not a button", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("has no tabIndex (not keyboard-focusable)", () => {
      render(<MismatchChip variant="overfunded" amountFormatted="EUR 10.00" />);
      const status = screen.getByRole("status");
      expect(status).not.toHaveAttribute("tabindex");
    });
  });
});
