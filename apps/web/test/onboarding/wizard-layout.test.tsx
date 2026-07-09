/**
 * wizard-layout.test.tsx — the wizard card footer (Back / Next-Create action row).
 *
 * Regression: on the last step the primary label is long ("Create budget" /
 * "Створити бюджет") and, in the loading state, carries a spinner. The old
 * single-row layout let that whitespace-nowrap button grow past the card's right
 * edge on narrow screens. The footer now stacks full-width on mobile (primary on
 * top) and only becomes a right-aligned pill row at sm+.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardLayout } from "@/components/onboarding/wizard-layout";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function renderLayout(isLoading = false) {
  return render(
    <WizardLayout
      currentStep={3}
      isLoading={isLoading}
      onNext={() => {}}
      onBack={() => {}}
    >
      <div>content</div>
    </WizardLayout>,
  );
}

describe("WizardLayout footer", () => {
  it("primary button is full-width on mobile, auto (pill) at sm+", () => {
    renderLayout();
    const create = screen.getByRole("button", { name: /create_budget/i });
    expect(create.className).toMatch(/\bw-full\b/);
    expect(create.className).toMatch(/sm:w-auto/);
  });

  it("Back button is full-width on mobile", () => {
    renderLayout();
    const back = screen.getByRole("button", { name: /^back$/i });
    expect(back.className).toMatch(/\bw-full\b/);
    expect(back.className).toMatch(/sm:w-auto/);
  });

  it("action row stacks on mobile and is a row at sm+ (no overflow)", () => {
    renderLayout();
    const create = screen.getByRole("button", { name: /create_budget/i });
    const row = create.parentElement!;
    expect(row.className).toMatch(/flex-col-reverse/);
    expect(row.className).toMatch(/sm:flex-row/);
  });

  it("loading state shows the spinner inside the (bounded) primary button", () => {
    renderLayout(true);
    const create = screen.getByRole("button", { name: /create_budget/i });
    expect(create.querySelector(".animate-spin")).not.toBeNull();
    // still full-width on mobile so the spinner+label can't push past the card.
    expect(create.className).toMatch(/\bw-full\b/);
  });
});
