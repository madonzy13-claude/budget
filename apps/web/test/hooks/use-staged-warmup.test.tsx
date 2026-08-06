/**
 * use-staged-warmup.test.tsx — warming the Overview's sections without a stampede
 * (260806 request).
 *
 * The sections used to fetch only when opened, so every one of them cost a wait
 * the first time — and offline a section that had never been opened had nothing
 * to show at all. They fetch on mount now, collapsed or not.
 *
 * All at once is the wrong fix: firing every section's endpoint together is the
 * ~16-way burst that inflated each request ~4x and made the first pill tap janky
 * (260804). So each section takes a WAVE, and a wave only starts once the ones
 * before it have had their turn.
 *
 * A section the member actually opens never waits for its wave.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStagedWarmup, WARMUP_WAVE_MS } from "@/hooks/use-staged-warmup";

afterEach(() => {
  vi.useRealTimers();
});

describe("useStagedWarmup", () => {
  it("lets the first wave start at once", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStagedWarmup(0));
    expect(result.current).toBe(true);
  });

  it("holds a later wave back until its turn", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStagedWarmup(2));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(WARMUP_WAVE_MS);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(WARMUP_WAVE_MS);
    });
    expect(result.current).toBe(true);
  });

  it("brings the waves up in order", () => {
    vi.useFakeTimers();
    const first = renderHook(() => useStagedWarmup(1));
    const second = renderHook(() => useStagedWarmup(3));

    act(() => {
      vi.advanceTimersByTime(WARMUP_WAVE_MS);
    });
    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(WARMUP_WAVE_MS * 2);
    });
    expect(second.result.current).toBe(true);
  });

  // Opening a section is an explicit ask — it must not sit behind a queue that
  // exists only to be polite to the network.
  it("skips the queue for a section the member opened", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStagedWarmup(3, { now: true }));
    expect(result.current).toBe(true);
  });

  it("stays on once its wave has come up, even if the section is closed again", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ now }: { now: boolean }) => useStagedWarmup(3, { now }),
      { initialProps: { now: true } },
    );
    expect(result.current).toBe(true);
    rerender({ now: false });
    // Turning it back off would throw away data already in flight or in hand.
    expect(result.current).toBe(true);
  });

  it("stops its timer when the section goes away", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useStagedWarmup(5));
    unmount();
    // No pending work should survive the unmount.
    expect(vi.getTimerCount()).toBe(0);
  });
});
