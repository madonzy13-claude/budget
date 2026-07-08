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
    expect(
      document.documentElement.style.getPropertyValue("--safe-top"),
    ).toBe("");
  });

  it("standalone → persists the measured inset + sets --safe-top", () => {
    setStandalone(true);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      height: 59,
    } as DOMRect);
    render(<SafeAreaTopSync />);
    expect(window.localStorage.getItem("sat")).toBe("59");
    expect(
      document.documentElement.style.getPropertyValue("--safe-top"),
    ).toBe("59px");
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
