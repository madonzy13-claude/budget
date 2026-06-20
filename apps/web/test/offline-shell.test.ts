/**
 * offline-shell.test.ts — regression for offline-shell.html (260615-e8s r3/r4).
 * The shell is shown by the SW only when an offline navigation misses the
 * nav-doc cache. Behaviour:
 *   - ROOT entry ("/", the PWA start_url): redirect to the cached localized home
 *     when it exists (cold-open recovery); otherwise reveal the note.
 *   - localized uncached route: show the "not available offline" note + a
 *     "Go to home" shortcut when the cached home exists.
 * Executes the REAL inline script from the file against happy-dom.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const HTML = readFileSync(
  resolve(__dirname, "../public/offline-shell.html"),
  "utf8",
);
const BODY_INNER = HTML.match(/<body>([\s\S]*)<\/body>/)![1];
const SCRIPT = HTML.match(/<script>([\s\S]*?)<\/script>/)![1];

function runShell(): void {
  document.body.innerHTML = BODY_INNER;
  (0, eval)(SCRIPT);
}

async function waitFor(
  pred: () => boolean,
  timeoutMs = 1000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return pred();
}

let replaceSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = "";
  document.cookie = "budget-locale=en; path=/";
  replaceSpy = vi.fn();
  Object.defineProperty(window.location, "replace", {
    configurable: true,
    value: replaceSpy,
  });
  delete (globalThis as unknown as { caches?: unknown }).caches;
});

describe("offline-shell — localized uncached route", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/en/budgets/abc-123/spendings");
  });

  it("shows the 'not available offline' note + red bar", async () => {
    runShell();
    await new Promise((r) => setTimeout(r, 50));
    expect(
      document.querySelector('[data-testid="offline-shell-note"]'),
    ).not.toBeNull();
    expect(document.querySelector("h1")?.textContent ?? "").toContain(
      "isn't available offline",
    );
    expect(document.querySelector(".shell-stale-bar")).not.toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("reveals 'Go to home' when the cached home document exists", async () => {
    const match = vi.fn().mockResolvedValue({});
    (globalThis as unknown as { caches: unknown }).caches = { match };
    runShell();
    const link = document.getElementById("shell-home-link")!;
    expect(await waitFor(() => !link.hasAttribute("hidden"))).toBe(true);
    expect(link.getAttribute("href")).toBe("/en");
    expect(match).toHaveBeenCalledWith("/en", { ignoreSearch: true });
  });

  it("keeps 'Go to home' hidden when home is not cached", async () => {
    (globalThis as unknown as { caches: unknown }).caches = {
      match: vi.fn().mockResolvedValue(undefined),
    };
    runShell();
    await new Promise((r) => setTimeout(r, 80));
    expect(
      document.getElementById("shell-home-link")!.hasAttribute("hidden"),
    ).toBe(true);
  });
});

describe("offline-shell — cold open at the start_url '/'", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("redirects to the cached localized home (from the budget-locale cookie)", async () => {
    const match = vi.fn().mockResolvedValue({});
    (globalThis as unknown as { caches: unknown }).caches = { match };
    runShell();
    expect(await waitFor(() => replaceSpy.mock.calls.length > 0)).toBe(true);
    expect(replaceSpy).toHaveBeenCalledWith("/en");
    expect(match).toHaveBeenCalledWith("/en", { ignoreSearch: true });
    // The bare note stayed hidden (we recovered instead of stranding).
    expect(document.querySelector(".shell-note")!.hasAttribute("hidden")).toBe(
      true,
    );
  });

  it("reveals the note when no cached home exists (nothing to recover to)", async () => {
    (globalThis as unknown as { caches: unknown }).caches = {
      match: vi.fn().mockResolvedValue(undefined),
    };
    runShell();
    const note = document.querySelector(".shell-note")!;
    expect(await waitFor(() => !note.hasAttribute("hidden"))).toBe(true);
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
