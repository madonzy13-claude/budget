import { describe, expect, test, vi } from "vitest";
import { fetchWith429Retry } from "../../e2e/fixtures/fetch-with-429-retry";

function resWithStatus(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : "{}", { status, headers });
}

describe("fetchWith429Retry", () => {
  test("returns first response when not rate-limited", async () => {
    const doFetch = vi.fn().mockResolvedValue(resWithStatus(200));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const res = await fetchWith429Retry(doFetch, { sleep });

    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("retries after 429 until success", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(resWithStatus(429))
      .mockResolvedValueOnce(resWithStatus(429))
      .mockResolvedValueOnce(resWithStatus(200));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const res = await fetchWith429Retry(doFetch, { sleep, baseDelayMs: 1000 });

    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test("honors Retry-After / X-Retry-After header (seconds) when present", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(resWithStatus(429, { "x-retry-after": "7" }))
      .mockResolvedValueOnce(resWithStatus(200));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchWith429Retry(doFetch, { sleep, baseDelayMs: 1000 });

    const waited = sleep.mock.calls[0][0] as number;
    expect(waited).toBeGreaterThanOrEqual(7000);
    expect(waited).toBeLessThan(10000);
  });

  test("backs off progressively without header", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(resWithStatus(429))
      .mockResolvedValueOnce(resWithStatus(429))
      .mockResolvedValueOnce(resWithStatus(200));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchWith429Retry(doFetch, { sleep, baseDelayMs: 2000 });

    const first = sleep.mock.calls[0][0] as number;
    const second = sleep.mock.calls[1][0] as number;
    expect(second).toBeGreaterThan(first);
  });

  test("gives up after maxAttempts and returns last 429", async () => {
    const doFetch = vi.fn().mockResolvedValue(resWithStatus(429));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const res = await fetchWith429Retry(doFetch, { sleep, maxAttempts: 3 });

    expect(res.status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
