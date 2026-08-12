/**
 * offline-write.test.ts — deterministic guard for the SHARED honest-offline
 * write wrapper used by every mutation (wallets, reserves, categories,
 * settings, drafts, …) so they all behave like the transaction quick-entry:
 *   - device-knows-offline (navigator.onLine===false) → OfflineWriteError, no POST
 *   - network throw / timeout / hung POST / 5xx → OfflineWriteError
 *   - genuine 4xx → Response returned (caller surfaces its own validation error)
 *   - 2xx → Response returned
 * This is the single source of truth that makes "you're offline" consistent
 * across ALL data changes, not just the spendings quick-entry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// budget-fetch.clientApiFetch is the low-level fetch the wrapper delegates to.
vi.mock("../../src/lib/budget-fetch", () => ({ clientApiFetch: vi.fn() }));
import { clientApiFetch } from "../../src/lib/budget-fetch";
import {
  clientApiWrite,
  OfflineWriteError,
  isOfflineWriteError,
} from "../../src/lib/offline-write";

const mockFetch = clientApiFetch as ReturnType<typeof vi.fn>;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});
afterEach(() => setOnline(true));

describe("clientApiWrite — shared honest-offline write wrapper", () => {
  it("2xx returns the Response", async () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await clientApiWrite("/wallets", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("genuine 4xx returns the Response (caller owns the validation error)", async () => {
    mockFetch.mockResolvedValue(new Response("bad", { status: 422 }));
    const res = await clientApiWrite("/wallets", { method: "POST" });
    expect(res.status).toBe(422);
    expect(res.ok).toBe(false);
  });

  /**
   * navigator.onLine===false was treated as gospel: refuse instantly, never
   * even try. But iOS lies in BOTH directions — a PWA resumed from background,
   * or a handover between Wi-Fi and cellular, can report false on a perfectly
   * live link. The user hit exactly that: full 5G, healthy server answering in
   * ~200ms, and "You're offline — changes can't be saved right now" with no
   * request ever leaving the device (260811).
   *
   * So a device that believes it is offline still gets ONE attempt. If it is
   * genuinely offline the fetch fails immediately and the same honest toast
   * appears; if the flag was lying, the write goes through.
   */
  it("navigator.onLine===false still ATTEMPTS the write (the flag lies)", async () => {
    setOnline(false);
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await clientApiWrite("/wallets", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("navigator.onLine===false and genuinely offline → OfflineWriteError", async () => {
    setOnline(false);
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      clientApiWrite("/wallets", { method: "POST" }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("network throw (Failed to fetch) → OfflineWriteError", async () => {
    setOnline(true); // iOS lies — link is actually dead.
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      clientApiWrite("/wallets", { method: "POST" }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("AbortError → OfflineWriteError", async () => {
    mockFetch.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(
      clientApiWrite("/wallets", { method: "POST" }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
  });

  it("5xx → OfflineWriteError (server-unreachable class)", async () => {
    mockFetch.mockResolvedValue(new Response("oops", { status: 503 }));
    await expect(
      clientApiWrite("/wallets", { method: "POST" }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
  });

  it("hung POST (never settles) rejects with OfflineWriteError within the race window", async () => {
    vi.useFakeTimers();
    try {
      mockFetch.mockReturnValue(new Promise<Response>(() => {}));
      const p = clientApiWrite("/wallets", { method: "POST" });
      // Attach a rejection handler BEFORE advancing so the rejection is not unhandled.
      const assertion = expect(p).rejects.toBeInstanceOf(OfflineWriteError);
      await vi.advanceTimersByTimeAsync(6500);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("isOfflineWriteError recognises the error by instance and by name", () => {
    expect(isOfflineWriteError(new OfflineWriteError())).toBe(true);
    expect(isOfflineWriteError({ name: "OfflineWriteError" })).toBe(true);
    expect(isOfflineWriteError(new Error("nope"))).toBe(false);
    expect(isOfflineWriteError(null)).toBe(false);
  });
});
