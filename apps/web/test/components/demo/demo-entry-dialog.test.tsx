/**
 * demo-entry-dialog.test.tsx
 *
 * The demo's front door. The property that matters: choosing a language must
 * send the visitor to that language's ACCOUNT, because the demo data is stored
 * per-language rather than translated at render time. A version that only
 * swapped the UI locale would look right and show English categories.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { DemoEntryDialog } from "@/components/demo/demo-entry-dialog";

const assign = vi.fn();

beforeEach(() => {
  assign.mockClear();
  document.cookie = "budget-locale=; path=/; max-age=0";
  Object.defineProperty(window, "location", {
    value: { assign, pathname: "/en/sign-in", search: "" },
    writable: true,
  });
});

describe("DemoEntryDialog", () => {
  it("shows a way in without opening anything on its own", () => {
    render(<DemoEntryDialog />);
    expect(screen.getByTestId("demo-entry-link")).toBeTruthy();
    expect(screen.queryByTestId("demo-entry-dialog")).toBeNull();
  });

  it("opens the language picker when the link is clicked", async () => {
    render(<DemoEntryDialog />);
    fireEvent.click(screen.getByTestId("demo-entry-link"));
    expect(await screen.findByTestId("demo-entry-dialog")).toBeTruthy();
  });

  it("offers exactly English, Polish and Ukrainian", async () => {
    render(<DemoEntryDialog />);
    fireEvent.click(screen.getByTestId("demo-entry-link"));
    await screen.findByTestId("demo-entry-dialog");
    for (const code of ["en", "pl", "uk"]) {
      expect(screen.getByTestId(`demo-lang-${code}`)).toBeTruthy();
    }
  });

  it("enters the chosen language's OWN demo account", async () => {
    // Not `/pl` — `/pl/demo`. Each language is a separate account holding
    // separate data; navigating to the locale alone would keep the visitor
    // signed out, or (worse) in the English demo with Polish chrome.
    render(<DemoEntryDialog />);
    fireEvent.click(screen.getByTestId("demo-entry-link"));
    await screen.findByTestId("demo-entry-dialog");
    fireEvent.click(screen.getByTestId("demo-lang-pl"));

    expect(assign).toHaveBeenCalledWith("/pl/demo");
    expect(document.cookie).toContain("budget-locale=pl");
  });

  it("cannot be double-submitted while it is opening", async () => {
    // The click triggers a full navigation and a server-side sign-in; a second
    // one would start a second session for no reason.
    render(<DemoEntryDialog />);
    fireEvent.click(screen.getByTestId("demo-entry-link"));
    await screen.findByTestId("demo-entry-dialog");
    fireEvent.click(screen.getByTestId("demo-lang-en"));
    fireEvent.click(screen.getByTestId("demo-lang-uk"));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/en/demo");
  });
});
