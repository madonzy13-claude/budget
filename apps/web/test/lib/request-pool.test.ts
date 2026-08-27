/**
 * request-pool.test.ts — the limiter that replaced the warm-up timers.
 *
 * The app used to space background fetches out on a clock: 700ms per Overview
 * wave, plus a deferred prefetch tier chained behind the priority one. Measured
 * on a cold BDP overview that left the page 3,553ms wide with 1,781ms of it
 * IDLE — half the warm-up was waiting on setTimeout rather than the network.
 *
 * A clock is the wrong instrument. It idles when the connection is quick and
 * floods when it is slow, because it never looks at what is actually in flight.
 * A concurrency cap looks at nothing else. Measured against the live API, the
 * knee is 6: wall time bottoms out there (256ms for 14 requests) with per-request
 * latency still unloaded (82ms median vs 66ms at cap 1), while 8 and above buy
 * nothing and double the latency.
 */
import { describe, test, expect, vi } from "vitest";
import {
  runPooled,
  runCounted,
  POOL_LIMIT,
  BACKGROUND_LIMIT,
} from "@/lib/request-pool";

/** A task that resolves when told, reporting when it started. */
function gated() {
  let release!: () => void;
  const started = { value: false };
  const p = new Promise<void>((r) => (release = r));
  return {
    started,
    release,
    fn: async () => {
      started.value = true;
      await p;
      return "done";
    },
  };
}

describe("runPooled", () => {
  test("lets the first BACKGROUND_LIMIT tasks start at once", async () => {
    const tasks = Array.from({ length: BACKGROUND_LIMIT }, gated);
    const all = tasks.map((t) => runPooled(t.fn));
    await Promise.resolve();
    await Promise.resolve();
    expect(tasks.every((t) => t.started.value)).toBe(true);
    tasks.forEach((t) => t.release());
    await Promise.all(all);
  });

  test("holds the one past the limit until a slot frees", async () => {
    const tasks = Array.from({ length: BACKGROUND_LIMIT + 1 }, gated);
    const all = tasks.map((t) => runPooled(t.fn));
    await Promise.resolve();
    await Promise.resolve();
    const extra = tasks[BACKGROUND_LIMIT]!;
    expect(extra.started.value).toBe(false);
    // Free exactly one slot — the queued task takes it, and only it.
    tasks[0]!.release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(extra.started.value).toBe(true);
    tasks.forEach((t) => t.release());
    await Promise.all(all);
  });

  // A slot held by a hung request must come back, or one bad endpoint parks a
  // sixth of the pool for the life of the page.
  test("frees the slot when a task throws", async () => {
    const boom = runPooled(async () => {
      throw new Error("nope");
    });
    await expect(boom).rejects.toThrow("nope");
    const t = gated();
    const p = runPooled(t.fn);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.started.value).toBe(true);
    t.release();
    await p;
  });

  test("gives back what the task returned", async () => {
    await expect(runPooled(async () => 42)).resolves.toBe(42);
  });

  // The whole point of a cap over a clock: it adapts. Nothing waits on a timer,
  // so a fast connection drains the queue as fast as the wire allows.
  test("starts a queued task the moment a slot frees, not on a schedule", async () => {
    vi.useFakeTimers();
    try {
      const tasks = Array.from({ length: BACKGROUND_LIMIT + 1 }, gated);
      const all = tasks.map((t) => runPooled(t.fn));
      await Promise.resolve();
      await Promise.resolve();
      tasks[0]!.release();
      // No timer advanced at all — if the pool waited on one, this would fail.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(tasks[BACKGROUND_LIMIT]!.started.value).toBe(true);
      tasks.forEach((t) => t.release());
      await Promise.all(all);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Two lanes, one budget.
 *
 * Capping background traffic alone just moves the herd: measured on a cold
 * overview after the waves came out, the page peaked at 23 concurrent with a
 * 261ms median — the knee says 82ms at six. Most of that was FOREGROUND
 * component queries, which bypassed the cap entirely.
 *
 * So foreground is counted too. It is never made to wait — a person waiting on
 * a tap must not queue behind warm-up, and six hung prefetches must not be able
 * to park the UI for their 8s abort — but while it is in flight it occupies a
 * slot, and background backs off to make room.
 */
describe("runCounted — the foreground lane", () => {
  test("goes ahead of background work already queued", async () => {
    // Fill every background slot, then queue more background behind it.
    const bg = Array.from({ length: BACKGROUND_LIMIT + 3 }, gated);
    const bgAll = bg.map((t) => runPooled(t.fn));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const queuedBefore = bg.filter((t) => t.started.value).length;
    expect(queuedBefore).toBe(BACKGROUND_LIMIT);

    // The reserved slot means this starts straight away, even though three
    // background tasks have been waiting longer.
    const fg = gated();
    const fgP = runCounted(fg.fn);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(fg.started.value).toBe(true);
    expect(bg.filter((t) => t.started.value).length).toBe(BACKGROUND_LIMIT);

    fg.release();
    await fgP;
    for (let round = 0; round < 8; round++) {
      bg.forEach((t) => t.release());
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
    await Promise.all(bgAll);
  });

  // The reserve is what makes that promise keepable: background may never take
  // the last slot, so a tap cannot be stuck behind prefetches waiting out their
  // 8s aborts.
  test("background never takes the last slot", async () => {
    const bg = Array.from({ length: POOL_LIMIT + 2 }, gated);
    const all = bg.map((t) => runPooled(t.fn));
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(bg.filter((t) => t.started.value).length).toBe(BACKGROUND_LIMIT);
    expect(BACKGROUND_LIMIT).toBeLessThan(POOL_LIMIT);
    for (let round = 0; round < 8; round++) {
      bg.forEach((t) => t.release());
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
    await Promise.all(all);
  });

  test("total in flight never exceeds POOL_LIMIT", async () => {
    let live = 0;
    let peak = 0;
    const mk = () => async () => {
      live += 1;
      peak = Math.max(peak, live);
      await Promise.resolve();
      live -= 1;
    };
    await Promise.all([
      ...Array.from({ length: 10 }, () => runPooled(mk())),
      ...Array.from({ length: 10 }, () => runCounted(mk())),
    ]);
    expect(peak).toBeLessThanOrEqual(POOL_LIMIT);
  });

  test("gives its slot back when it throws", async () => {
    await expect(
      runCounted(async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    const bg = Array.from({ length: BACKGROUND_LIMIT }, gated);
    const all = bg.map((t) => runPooled(t.fn));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(bg.every((t) => t.started.value)).toBe(true);
    bg.forEach((t) => t.release());
    await Promise.all(all);
  });
});
