/**
 * offline-shell.test.ts — regression for the offline-shell.html not-cached
 * fallback (260615-e8s round 3). The shell is shown by the SW only when an
 * offline navigation misses the nav-doc cache (route never opened online). It
 * must show the "not available offline" note and, when the cached home document
 * exists, reveal a "Go to home" shortcut. This executes the REAL inline script
 * from the file against happy-dom.
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

beforeEach(() => {
  document.body.innerHTML = "";
  // A non-home route (so the Go-to-home shortcut logic is eligible).
  window.history.pushState({}, "", "/en/budgets/abc-123/spendings");
  delete (globalThis as unknown as { caches?: unknown }).caches;
});

describe("offline-shell not-cached fallback", () => {
  it("shows the 'not available offline' note", async () => {
    runShell();
    await new Promise((r) => setTimeout(r, 50));
    expect(
      document.querySelector('[data-testid="offline-shell-note"]'),
    ).not.toBeNull();
    expect(document.querySelector("h1")?.textContent ?? "").toContain(
      "isn't available offline",
    );
    // The red offline bar is present.
    expect(document.querySelector(".shell-stale-bar")).not.toBeNull();
  });

  it("keeps the Go-to-home link hidden when the home document is not cached", async () => {
    (globalThis as unknown as { caches: unknown }).caches = {
      match: vi.fn().mockResolvedValue(undefined),
    };
    runShell();
    await new Promise((r) => setTimeout(r, 80));
    const link = document.getElementById("shell-home-link")!;
    expect(link.hasAttribute("hidden")).toBe(true);
  });

  it("reveals the Go-to-home link when the cached home document exists", async () => {
    const match = vi.fn().mockResolvedValue({} /* any truthy cache hit */);
    (globalThis as unknown as { caches: unknown }).caches = { match };
    runShell();
    const link = document.getElementById("shell-home-link")!;
    const revealed = await waitFor(() => !link.hasAttribute("hidden"));
    expect(revealed).toBe(true);
    expect(link.getAttribute("href")).toBe("/en");
    expect(match).toHaveBeenCalledWith("/en", { ignoreSearch: true });
  });
});
