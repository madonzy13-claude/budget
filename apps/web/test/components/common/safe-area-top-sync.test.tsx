/**
 * safe-area-top-sync.test.tsx — the persisted-top-inset island that stabilises the
 * iOS standalone cold-launch header padding (no top-drop jump).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { SafeAreaTopSync } from "@/components/common/safe-area-top-sync";

function setStandalone(v: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: v,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as typeof window.matchMedia;
}

describe("SafeAreaTopSync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.style.removeProperty("--safe-top");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing", () => {
    setStandalone(false);
    const { container } = render(<SafeAreaTopSync />);
    expect(container.firstChild).toBeNull();
  });

  it("non-standalone (browser tab) → does not persist or set --safe-top", () => {
    setStandalone(false);
    render(<SafeAreaTopSync />);
    expect(window.localStorage.getItem("sat")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe(
      "",
    );
  });

  it("standalone → persists the measured inset + sets --safe-top", () => {
    setStandalone(true);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      height: 59,
    } as DOMRect);
    render(<SafeAreaTopSync />);
    expect(window.localStorage.getItem("sat")).toBe("59");
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe(
      "59px",
    );
  });

  // Rotate an installed PWA to landscape and the notch moves to the SIDE, so
  // the top inset really is 0. The write was guarded on `h > 0` — meant to
  // ignore the cold-launch frames where iOS has not resolved the inset yet —
  // which also swallowed this, leaving the header padded by the PORTRAIT notch
  // in landscape: a ~59px empty band above the app (user, 260823).
  it("rotating to landscape releases the portrait inset", () => {
    setStandalone(true);
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 59 } as DOMRect);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    render(<SafeAreaTopSync />);
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe(
      "59px",
    );

    // …turn the phone.
    rect.mockReturnValue({ height: 0 } as DOMRect);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 390,
    });
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe(
      "0px",
    );
    // …but the stored hint stays the PORTRAIT inset: it exists to pre-paint the
    // next cold launch, which is overwhelmingly portrait, and a stored 0 would
    // bring back the 0→59 drop this island was written to kill.
    expect(window.localStorage.getItem("sat")).toBe("59");
  });

  it("standalone but inset probes 0 (unresolved) → does not persist", () => {
    setStandalone(true);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      height: 0,
    } as DOMRect);
    render(<SafeAreaTopSync />);
    expect(window.localStorage.getItem("sat")).toBeNull();
  });
});
