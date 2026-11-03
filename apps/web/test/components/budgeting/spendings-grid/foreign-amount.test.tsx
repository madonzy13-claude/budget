/**
 * foreign-amount.test.tsx — D-03 characterization: a transaction in another
 * currency than the (current) budget currency reads in its own currency.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { FxAmount } from "@/components/budgeting/spendings-grid/foreign-amount";

describe("FxAmount", () => {
  it("an old-currency row keeps its own amount and sign after a budget currency change", () => {
    const { container } = render(
      <FxAmount
        row={{ amountConvertedCents: "2500", currencyConverted: "EUR", amountOriginalCents: "10000", currencyOriginal: "PLN" }}
        locale="en"
      />,
    );
    expect(container.textContent).toContain("100");
    expect(container.textContent).toContain("zł");
  });

  it("a budget-currency row shows the bare amount", () => {
    const { container } = render(
      <FxAmount row={{ amountConvertedCents: "2500", currencyConverted: "EUR", amountOriginalCents: "2500", currencyOriginal: "EUR" }} locale="en" />,
    );
    expect(container.textContent).toBe("25");
  });
});
