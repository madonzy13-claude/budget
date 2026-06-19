/**
 * sw-deep-link-nav.test.tsx
 * Tests for SwDeepLinkNav — consumes a pending deep-link the SW persisted to a
 * Cache and navigates the page on foreground (the reliable iOS push-tap path).
 *
 * WHY this exists (260618): on a standalone iOS PWA the SW cannot route the open
 * window from notificationclick (matchAll empty; navigate()/openWindow() merely
 * refocus). The SW instead writes the target URL to a Cache; this component
 * reads + clears it when the PWA returns to the foreground and navigates.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SwDeepLinkNav } from "@/components/common/sw-deep-link-nav";

const DEEPLINK_KEY = "/__pending_deeplink__";

// ---------------------------------------------------------------------------
// Fakes: CacheStorage, navigator.serviceWorker, window.location
// ---------------------------------------------------------------------------
let store: Map<string, string>;
let cacheDelete: ReturnType<typeof vi.fn>;
let assignSpy: ReturnType<typeof vi.fn>;
let swMessageHandler: ((e: MessageEvent) => void) | null = null;

function setLocation(pathname: string, search = "") {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: "https://app.test", pathname, search, assign: assignSpy },
  });
}

beforeEach(() => {
  store = new Map();
  cacheDelete = vi.fn(async (k: string) => store.delete(k));
  const cacheMock = {
    match: vi.fn(async (k: string) =>
      store.has(k) ? new Response(store.get(k)) : undefined,
    ),
    delete: cacheDelete,
    put: vi.fn(async () => {}),
  };
  // @ts-expect-error test double
  globalThis.caches = { open: vi.fn(async () => cacheMock) };

  swMessageHandler = null;
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: vi.fn((t: string, h: (e: MessageEvent) => void) => {
        if (t === "message") swMessageHandler = h;
      }),
      removeEventListener: vi.fn(),
    },
  });

  assignSpy = vi.fn();
  setLocation("/en/budgets");
});

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.caches;
  // @ts-expect-error cleanup
  delete navigator.serviceWorker;
});

describe("SwDeepLinkNav", () => {
  test("navigates to a pending deep-link present at mount (cold start)", async () => {
    store.set(DEEPLINK_KEY, "/en/budgets/b-1/reserves?task=t-1");
    render(<SwDeepLinkNav />);
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith(
        "/en/budgets/b-1/reserves?task=t-1",
      ),
    );
    // consume-once: the entry is cleared
    expect(cacheDelete).toHaveBeenCalledWith(DEEPLINK_KEY);
  });

  test("navigates when the PWA returns to the foreground (iOS tap path)", async () => {
    render(<SwDeepLinkNav />);
    // No pending at mount → no nav yet.
    await waitFor(() => expect(globalThis.caches.open).toHaveBeenCalled());
    expect(assignSpy).not.toHaveBeenCalled();

    // SW writes the pending URL, then the tap foregrounds the app.
    store.set(DEEPLINK_KEY, "/en/budgets/b-9/reserves?task=t-9");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith(
        "/en/budgets/b-9/reserves?task=t-9",
      ),
    );
  });

  test("does nothing when there is no pending deep-link", async () => {
    render(<SwDeepLinkNav />);
    await waitFor(() => expect(globalThis.caches.open).toHaveBeenCalled());
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 10));
    expect(assignSpy).not.toHaveBeenCalled();
  });

  test("skips navigation when already on the exact target route", async () => {
    setLocation("/en/budgets/b-1/reserves", "?task=t-1");
    store.set(DEEPLINK_KEY, "/en/budgets/b-1/reserves?task=t-1");
    render(<SwDeepLinkNav />);
    await waitFor(() => expect(cacheDelete).toHaveBeenCalled());
    expect(assignSpy).not.toHaveBeenCalled();
  });

  test("an SW DEEP_LINK message triggers a consume", async () => {
    render(<SwDeepLinkNav />);
    await waitFor(() => expect(swMessageHandler).toBeTypeOf("function"));
    store.set(DEEPLINK_KEY, "/en/budgets/b-2/reserves?task=t-2");
    swMessageHandler!({ data: { type: "DEEP_LINK" } } as MessageEvent);
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith(
        "/en/budgets/b-2/reserves?task=t-2",
      ),
    );
  });

  test("removes its listeners on unmount", () => {
    const { unmount } = render(<SwDeepLinkNav />);
    const removeDoc = vi.spyOn(document, "removeEventListener");
    const removeWin = vi.spyOn(window, "removeEventListener");
    unmount();
    expect(removeDoc).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(removeWin).toHaveBeenCalledWith("focus", expect.any(Function));
  });
});
