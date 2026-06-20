/**
 * fetch-with-429-retry.ts — backoff wrapper for Better Auth rate limiting.
 *
 * The fresh-user-per-scenario fixture signs up a new account per scenario.
 * Better Auth rate-limits /sign-up/email per IP, and every E2E worker shares
 * one IP (Cloudflare tunnel), so bursts of scenarios trip 429s. The limiter
 * stays ON (budget-dev is internet-facing) — the fixture waits instead.
 */

export interface RetryOptions {
  /** Total attempts including the first one. Default 5. */
  maxAttempts?: number;
  /** Base backoff used when no Retry-After header is present. Default 4000ms. */
  baseDelayMs?: number;
  /** Injectable sleeper for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelayMs(res: Response, attempt: number, baseDelayMs: number) {
  const header =
    res.headers.get("retry-after") ?? res.headers.get("x-retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    // Header is authoritative; pad slightly so the window has actually rolled.
    return seconds * 1000 + 500;
  }
  return baseDelayMs * attempt;
}

export async function fetchWith429Retry(
  doFetch: () => Promise<Response>,
  opts: RetryOptions = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 4000;
  const sleep = opts.sleep ?? defaultSleep;

  let res = await doFetch();
  for (
    let attempt = 1;
    attempt < maxAttempts && res.status === 429;
    attempt++
  ) {
    await sleep(retryDelayMs(res, attempt, baseDelayMs));
    res = await doFetch();
  }
  return res;
}
