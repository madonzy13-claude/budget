import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";

describe("PillBadge", () => {
  it("renders the count when count > 0", () => {
    render(<PillBadge count={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("returns null when count === 0", () => {
    const { container } = render(<PillBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for negative counts (defensive)", () => {
    const { container } = render(<PillBadge count={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies the red --trading-down background class", () => {
    const { container } = render(<PillBadge count={1} />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.className).toContain("bg-[var(--trading-down)]");
    expect(span.className).toContain("text-white");
  });

  it("renders inline-flex so it fits inside pill labels", () => {
    const { container } = render(<PillBadge count={1} />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.className).toContain("inline-flex");
  });

  it("forwards aria-label for screen readers", () => {
    render(<PillBadge count={3} ariaLabel="3 tasks pending" />);
    expect(screen.getByLabelText("3 tasks pending")).toBeInTheDocument();
  });
});
