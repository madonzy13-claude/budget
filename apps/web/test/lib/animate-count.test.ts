/**
 * animate-count.test.ts — deterministic coverage of the rAF cover tween.
 * rAF + performance.now are stubbed so frames advance on a fake clock.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  animateCountTriple,
  type CountTriple,
} from "../../src/lib/animate-count";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Install a controllable rAF queue + clock; returns a flusher. */
function fakeRaf() {
  const queue: Array<() => void> = [];
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return {
    set time(ms: number) {
      clock = ms;
    },
    step(ms: number) {
      clock = ms;
      const cb = queue.shift();
      cb?.();
    },
    get pending() {
      return queue.length;
    },
  };
}

describe("animateCountTriple", () => {
  it("interpolates from→to, lands exactly on to, onDone fires once", () => {
    const r = fakeRaf();
    const frames: CountTriple[] = [];
    let done = 0;
    const from: CountTriple = {
      available: 50000,
      totalAvailable: 50000,
      totalUsed: 0,
    };
    const to: CountTriple = {
      available: 20000,
      totalAvailable: 20000,
      totalUsed: 30000,
    };

    animateCountTriple(
      from,
      to,
      100,
      (v) => frames.push(v),
      () => done++,
    );

    // Advance the fake clock past the end; flush every queued frame.
    for (const t of [0, 30, 60, 100, 100]) {
      if (!r.pending) break;
      r.step(t);
    }

    expect(done).toBe(1);
    expect(frames.at(-1)).toEqual(to); // settles exactly on target
    // Direction: Available counts DOWN, Used counts UP.
    expect(frames[0]!.available).toBeLessThanOrEqual(from.available);
    expect(frames.at(-1)!.totalUsed).toBe(30000);
  });

  it("jumps straight to `to` when duration ≤ 0", () => {
    const seen: CountTriple[] = [];
    let done = 0;
    const to: CountTriple = { available: 1, totalAvailable: 2, totalUsed: 3 };
    animateCountTriple(
      { available: 9, totalAvailable: 9, totalUsed: 9 },
      to,
      0,
      (v) => seen.push(v),
      () => done++,
    );
    expect(seen).toEqual([to]);
    expect(done).toBe(1);
  });

  it("cancel() halts further frames and never calls onDone", () => {
    const r = fakeRaf();
    const frames: CountTriple[] = [];
    let done = 0;
    const cancel = animateCountTriple(
      { available: 0, totalAvailable: 0, totalUsed: 0 },
      { available: 100, totalAvailable: 100, totalUsed: 100 },
      100,
      (v) => frames.push(v),
      () => done++,
    );

    r.step(10); // one frame
    const after = frames.length;
    cancel();
    r.step(50); // queued continuation is now a no-op

    expect(frames.length).toBe(after);
    expect(done).toBe(0);
  });
});
