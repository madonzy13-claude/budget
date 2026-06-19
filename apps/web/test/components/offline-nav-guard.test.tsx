/**
 * offline-nav-guard.test.tsx — OfflineNavGuard soft-nav + watchdog contract.
 *
 * CURRENT design (260618, see component doc + memory project_offline_nav_softnav_watchdog):
 * while OFFLINE, an in-app link click is NOT hard-navigated immediately. The
 * native soft-nav is allowed to run (so the PageTransition tab-slide animates
 * exactly like online), and a watchdog arms: if the URL has not advanced to the
 * target path within COMMIT_WATCHDOG_MS (~1200ms) — i.e. the soft-nav never
 * committed because the RSC wasn't cached — it falls back to a real document
 * navigation (window.location.assign). The common warmed case animates; the rare
 * cold cache-miss still resolves reliably.
 *
 * (Supersedes the earlier round-5 "always hard-nav" contract this file used to
 * assert — that was reverted once every tab gained loading.tsx + full prefetch +
 * SW RSC caching made offline soft-nav safe AND animated.)
 *
 * Online: does nothing (native soft-nav). Modifier / new-tab / external /
 * download links are ignored.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { OfflineNavGuard } from "../../src/components/common/offline-nav-guard";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

const CURRENT = "/en/budgets/abc/wallets";
const TARGET = "/en/budgets/abc/spendings";

let assignSpy: ReturnType<typeof vi.fn>;
let mockLoc: { pathname: string; origin: string; assign: typeof assignSpy };
let originalLocation: Location;

beforeEach(() => {
  vi.useFakeTimers();
  assignSpy = vi.fn();
  // Replace window.location with a controllable stub: the watchdog reads
  // window.location.pathname to detect a soft-nav commit and calls
  // window.location.assign for the hard-nav fallback. A stub lets us simulate
  // "URL committed" (set pathname) vs "stuck" (leave it) deterministically and
  // keeps the synthetic anchor click from actually navigating the test document.
  originalLocation = window.location;
  mockLoc = {
    pathname: CURRENT,
    origin: "http://localhost:3000",
    assign: assignSpy,
  };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: mockLoc,
  });
  setOnline(false);
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function clickLink(attrs: Record<string, string>): boolean {
  const a = document.createElement("a");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = "go";
  document.body.appendChild(a);
  const evt = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  return a.dispatchEvent(evt);
}

describe("OfflineNavGuard", () => {
  it("offline: allows the soft-nav (no preventDefault) and does NOT hard-nav when the URL commits", () => {
    render(<OfflineNavGuard />);
    const notPrevented = clickLink({ href: TARGET });
    // Soft-nav is allowed to run so the tab-slide animates — default NOT prevented.
    expect(notPrevented).toBe(true);
    // Simulate the soft-nav committing (App Router advances the URL).
    mockLoc.pathname = TARGET;
    vi.advanceTimersByTime(1500);
    // Committed within the watchdog window ⇒ no hard-nav fallback.
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("offline: hard-navigates as a fallback when the soft-nav never commits (cold cache)", () => {
    render(<OfflineNavGuard />);
    clickLink({ href: TARGET });
    // URL stays put — soft-nav hung on a missing RSC.
    vi.advanceTimersByTime(1500);
    expect(assignSpy).toHaveBeenCalledWith(TARGET);
  });

  it("offline: re-clicking the current path does nothing (no watchdog, no hard-nav)", () => {
    render(<OfflineNavGuard />);
    clickLink({ href: CURRENT });
    vi.advanceTimersByTime(1500);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("online: does nothing (native soft-nav)", () => {
    setOnline(true);
    render(<OfflineNavGuard />);
    const notPrevented = clickLink({ href: TARGET });
    vi.advanceTimersByTime(1500);
    expect(assignSpy).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it("offline: ignores external, new-tab, and download links", () => {
    render(<OfflineNavGuard />);
    clickLink({ href: "https://example.com/x" });
    clickLink({ href: "/en/x", target: "_blank" });
    clickLink({ href: "/en/x", download: "f" });
    vi.advanceTimersByTime(1500);
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
