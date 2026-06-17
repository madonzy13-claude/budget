/**
 * offline-nav-guard.test.tsx — OfflineNavGuard behavior (260617).
 *
 * Contract: while OFFLINE, an in-app link click must be turned into a real
 * DOCUMENT navigation (window.location.assign) — never left to Next's soft-nav.
 * A soft-nav fetches an RSC payload that HANGS offline, and because App Router
 * updates the URL optimistically the page is left blank with no recovery and the
 * SW never receives a document request to answer with the cached doc / offline
 * shell (the "black screen" bug). Online, the guard does nothing (native SPA
 * soft-nav). Modifier / new-tab / external / download links are ignored.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { OfflineNavGuard } from "../../src/components/common/offline-nav-guard";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

let assignSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  assignSpy = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  setOnline(false);
});

afterEach(() => {
  assignSpy.mockRestore();
  document.body.innerHTML = "";
});

/** Append an <a> and dispatch a primary click on it; returns whether the
 * event's default was prevented (dispatchEvent → false when preventDefault ran). */
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
  it("offline: an in-app link click forces a hard navigation (location.assign) + preventDefault", () => {
    render(<OfflineNavGuard />);
    const notPrevented = clickLink({ href: "/en/budgets/abc/spendings" });
    expect(assignSpy).toHaveBeenCalledWith("/en/budgets/abc/spendings");
    expect(notPrevented).toBe(false); // default WAS prevented
  });

  it("online: does nothing (native soft-nav)", () => {
    setOnline(true);
    render(<OfflineNavGuard />);
    const notPrevented = clickLink({ href: "/en/budgets/abc/spendings" });
    expect(assignSpy).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it("offline: ignores external, new-tab, and download links", () => {
    render(<OfflineNavGuard />);
    clickLink({ href: "https://example.com/x" }); // not same-origin path
    clickLink({ href: "/en/x", target: "_blank" }); // new tab
    clickLink({ href: "/en/x", download: "f" }); // download
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
