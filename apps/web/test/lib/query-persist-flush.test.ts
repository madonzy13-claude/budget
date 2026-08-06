/**
 * query-persist-flush.test.ts — getting the cache to disk before iOS takes the
 * app away (260806 device report).
 *
 * The persister was a debounced subscriber and nothing else: every cache change
 * reset an 800ms timer, and the write happened when it finally fired. That is
 * fine while the app is on screen and useless when it is not — iOS freezes a
 * backgrounded PWA almost at once and kills it without warning, so a pending
 * timer simply never runs.
 *
 * The reported sequence is exactly that shape: open the app, close it again
 * quickly, turn the network off, reopen — and the data fetched in that first
 * visit was never on disk to restore.
 *
 * So the app writes on its way out, on both of the events iOS actually delivers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const writes: number[] = [];
const written: { queryKey: readonly unknown[] }[] = [];
vi.mock("idb", () => ({
  openDB: async () => ({
    put: async (_store: string, rec: { state?: { queries?: unknown[] } }) => {
      writes.push(Date.now());
      written.length = 0;
      written.push(
        ...((rec?.state?.queries ?? []) as { queryKey: readonly unknown[] }[]),
      );
    },
    get: async () => undefined,
    delete: async () => {},
    close: () => {},
  }),
  deleteDB: async () => {},
}));

const { startPersisting } = await import("@/lib/query-persist");

function seeded() {
  const qc = new QueryClient();
  qc.setQueryData(["budget", "b1", "overview", "cards"], { total: 1 });
  return qc;
}

beforeEach(() => {
  writes.length = 0;
  written.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

describe("persisting the query cache", () => {
  it("writes when the app is hidden, without waiting out the debounce", async () => {
    vi.useFakeTimers();
    const qc = seeded();
    const stop = startPersisting(qc);

    qc.setQueryData(["budget", "b1", "overview", "cards"], { total: 2 });
    // Nothing has hit the disk yet — the debounce is still counting.
    expect(writes).toHaveLength(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    // Only a tick — far short of the 800ms debounce. If the write needs the
    // timer, it has not happened, which is the bug.
    await vi.advanceTimersByTimeAsync(10);

    expect(writes.length).toBeGreaterThan(0);
    stop();
  });

  // iOS does not reliably fire visibilitychange when it freezes a PWA; pagehide
  // is the one that arrives. Both are wired for that reason.
  it("writes on pagehide too", async () => {
    vi.useFakeTimers();
    const qc = seeded();
    const stop = startPersisting(qc);

    qc.setQueryData(["budget", "b1", "overview", "cards"], { total: 3 });
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(10);

    expect(writes.length).toBeGreaterThan(0);
    stop();
  });

  it("still writes on its own while the app is on screen", async () => {
    vi.useFakeTimers();
    const qc = seeded();
    const stop = startPersisting(qc);

    qc.setQueryData(["budget", "b1", "overview", "cards"], { total: 4 });
    await vi.advanceTimersByTimeAsync(900);

    expect(writes.length).toBeGreaterThan(0);
    stop();
  });

  it("stops listening once it is torn down", async () => {
    vi.useFakeTimers();
    const qc = seeded();
    const stop = startPersisting(qc);
    stop();

    qc.setQueryData(["budget", "b1", "overview", "cards"], { total: 5 });
    window.dispatchEvent(new Event("pagehide"));
    await vi.runAllTimersAsync();

    expect(writes).toHaveLength(0);
  });
});

// 260806 device report: the all-budgets page came up blank offline even though
// it had been open online moments before. Its queries are keyed ["budgets", …]
// — PLURAL, a different prefix from the per-budget ["budget", id, …] ones — and
// the persist allowlist only knew the singular. So the page's data was fetched,
// held in memory, and never written to disk.
//
// The range the page opens on is stored per USER (["user","ui-prefs"]), and the
// page waits for it before drawing anything: without that persisted too, the
// aggregate data would restore and the page would still sit on a skeleton
// forever, because the range it needs never arrives.
describe("what gets persisted", () => {
  const persistedKeys = async (key: readonly unknown[]) => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    qc.setQueryData(key, { some: "data" });
    const stop = startPersisting(qc);
    qc.setQueryData(key, { some: "data", again: true });
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(10);
    stop();
    return written.map((q) => JSON.stringify(q.queryKey));
  };

  it("keeps the all-budgets aggregate", async () => {
    const keys = await persistedKeys(["budgets", "aggregate"]);
    expect(keys).toContain(JSON.stringify(["budgets", "aggregate"]));
  });

  it("keeps the all-budgets wealth series", async () => {
    const key = [
      "budgets",
      "aggregate",
      "wealth",
      "2026-01-01",
      "2026-06-30",
      "capitalization",
      false,
    ];
    expect(await persistedKeys(key)).toContain(JSON.stringify(key));
  });

  it("keeps the user's own stored picks, which gate that page", async () => {
    const keys = await persistedKeys(["user", "ui-prefs"]);
    expect(keys).toContain(JSON.stringify(["user", "ui-prefs"]));
  });

  // The allowlist is a tenant-safety boundary as much as a size one: auth state
  // must never be written to a cache that outlives a session.
  it("still refuses anything outside the budget world", async () => {
    expect(await persistedKeys(["session"])).toHaveLength(0);
  });
});
