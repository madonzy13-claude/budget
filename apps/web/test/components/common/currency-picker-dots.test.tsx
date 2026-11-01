/**
 * currency-picker-dots.test.tsx — R6 (user): iOS never paints an underline
 * inside a native <select>, so the touch picker lays an invisible copy of the
 * selected code over it; inside `.editable-dots` that copy carries the same
 * dotted line as every other editable value — same dots, same width.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurrencyPicker } from "../../../src/components/common/currency-picker";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));

beforeEach(() => {
  // A touch device: the picker renders the native <select>.
  window.matchMedia = ((q: string) => ({
    matches: q.includes("coarse"),
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe("CurrencyPicker — dots over a native select", () => {
  it("lays the selected code over the select, invisible and click-through", () => {
    render(<CurrencyPicker value="USD" onSelect={() => {}} />);
    expect(screen.getByTestId("currency-picker-native")).toBeInTheDocument();
    const overlay = document.querySelector<HTMLElement>("[data-dots-overlay]")!;
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toBe("USD");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.className).toContain("pointer-events-none");
    expect(overlay.className).toContain("text-transparent");
  });
});
