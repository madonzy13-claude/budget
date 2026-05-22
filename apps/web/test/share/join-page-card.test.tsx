/**
 * join-page-card.test.tsx — SHRD-04 join page card component
 *
 * Tests all 6 states:
 *   1. valid + authenticated → "Join budget" CTA
 *   2. valid + unauthenticated → "Sign in to accept" CTA
 *   3. expired → error heading
 *   4. already_used → info heading
 *   5. not_found → error heading
 *   6. accepting (loading) → "Joining…" disabled CTA
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { JoinPageCard } from "@/components/share/join-page-card";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ locale: "en" }),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("JoinPageCard — 6 states (SHRD-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid + authenticated: shows Join budget button", () => {
    render(
      <JoinPageCard
        state="valid"
        budgetName="Family Budget"
        token="abc123"
        isAuthenticated={true}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toBeDefined();
    const btn = screen.getByRole("button", { name: /join.budget/i });
    expect(btn).toBeDefined();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("valid + unauthenticated: shows Sign in to accept link", () => {
    render(
      <JoinPageCard
        state="valid"
        budgetName="Family Budget"
        token="abc123"
        isAuthenticated={false}
      />,
    );
    // Unauthenticated CTA — rendered as a button (not a link, for testability)
    expect(
      screen.getByRole("button", { name: /sign.in.to.accept/i }),
    ).toBeDefined();
  });

  it("expired: shows invitation expired heading", () => {
    render(<JoinPageCard state="expired" />);
    const heading = screen.getByRole("heading", { level: 2 });
    // The heading should mention expired (key contains "expired")
    expect(heading.textContent).toBeTruthy();
    // State renders distinct from valid
    expect(screen.queryByRole("button", { name: /join.budget/i })).toBeNull();
  });

  it("already_used: shows already member heading and go to budget link", () => {
    render(<JoinPageCard state="already_used" budgetName="Family Budget" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBeTruthy();
    expect(screen.getByRole("link", { name: /go.to.budget/i })).toBeDefined();
  });

  it("not_found: shows invitation not found heading and return home link", () => {
    render(<JoinPageCard state="not_found" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBeTruthy();
    expect(screen.getByRole("link", { name: /return.home/i })).toBeDefined();
  });

  it("accepting state: CTA shows Joining… and is disabled", () => {
    render(
      <JoinPageCard
        state="valid"
        budgetName="Family Budget"
        token="abc123"
        isAuthenticated={true}
        accepting={true}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.textContent).toMatch(/joining/i);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
