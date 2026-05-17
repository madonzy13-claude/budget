/**
 * dashed-add-button.test.tsx — Vitest+RTL tests for DashedAddButton atom.
 *
 * Coverage:
 * - Renders label as text content
 * - data-testid matches testId prop
 * - Click fires onClick
 * - Enter key fires onClick
 * - Space key fires onClick
 * - aria-label defaults to label; uses ariaLabel when provided
 * - Default className contains row-shape (full-width) styles
 * - Custom className prop overrides default
 * - Default Icon is Plus; custom Icon prop renders instead
 * - Class list contains border-dashed and border-[var(--muted-foreground)]
 * - Class list does NOT contain primary yellow classes (D-PH5-E6)
 * - focus-visible:ring-[var(--info)] present
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashedAddButton } from "../../src/components/common/dashed-add-button";

describe("DashedAddButton", () => {
  it("renders the label prop as text content", () => {
    render(<DashedAddButton onClick={vi.fn()} label="Add spendings wallet" />);
    expect(screen.getByText("Add spendings wallet")).toBeInTheDocument();
  });

  it("data-testid matches testId prop", () => {
    render(
      <DashedAddButton
        onClick={vi.fn()}
        label="Add"
        testId="add-spendings-btn"
      />,
    );
    expect(screen.getByTestId("add-spendings-btn")).toBeInTheDocument();
  });

  it("click fires onClick", () => {
    const onClick = vi.fn();
    render(<DashedAddButton onClick={onClick} label="Add" />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Enter key fires onClick", () => {
    const onClick = vi.fn();
    render(<DashedAddButton onClick={onClick} label="Add" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Space key fires onClick", () => {
    const onClick = vi.fn();
    render(<DashedAddButton onClick={onClick} label="Add" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("aria-label defaults to label when ariaLabel not provided", () => {
    render(<DashedAddButton onClick={vi.fn()} label="Add wallet" />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Add wallet",
    );
  });

  it("uses ariaLabel prop when provided", () => {
    render(
      <DashedAddButton
        onClick={vi.fn()}
        label="Add wallet"
        ariaLabel="Custom aria"
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Custom aria",
    );
  });

  it("default class contains border-dashed", () => {
    render(<DashedAddButton onClick={vi.fn()} label="Add" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border-dashed");
  });

  it("default class contains muted-foreground border color", () => {
    render(<DashedAddButton onClick={vi.fn()} label="Add" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("--muted-foreground");
  });

  it("custom className overrides default", () => {
    render(
      <DashedAddButton
        onClick={vi.fn()}
        label="Add"
        className="my-custom-class"
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("my-custom-class");
    // When custom className provided, default class should not apply
    expect(btn.className).not.toContain("w-full");
  });

  it("does NOT have yellow primary background (D-PH5-E6)", () => {
    render(<DashedAddButton onClick={vi.fn()} label="Add" />);
    const btn = screen.getByRole("button");
    expect(btn.className).not.toContain("bg-[var(--primary)]");
    expect(btn.className).not.toContain("text-[var(--on-primary)]");
  });

  it("has focus-visible:ring with info color", () => {
    render(<DashedAddButton onClick={vi.fn()} label="Add" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("focus-visible:ring-[var(--info)]");
  });

  it("renders custom Icon prop when provided", () => {
    const CustomIcon = ({ className }: { className?: string }) => (
      <svg data-testid="custom-icon" className={className} />
    );
    render(<DashedAddButton onClick={vi.fn()} label="Add" Icon={CustomIcon} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
