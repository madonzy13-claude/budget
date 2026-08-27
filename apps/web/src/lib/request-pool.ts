/**
 * request-pool.ts — a concurrency cap for BACKGROUND fetching (260827).
 *
 * What this replaced: two clocks. The Overview released its sections in waves
 * 700ms apart (use-staged-warmup), and the tab prefetcher held its Settings tier
 * behind the priority tier plus a 4s fallback timer. Both existed to avoid a
 * measured problem — ~16 requests at once inflated each about fourfold — and
 * both solved it by making the page wait.
 *
 * Measured on a cold BDP overview: the warm-up spanned 3,553ms and the network
 * was IDLE for 1,781ms of it. Half the wait bought nothing.
 *
 * A clock cannot do this job. It idles on a fast connection and still floods on
 * a slow one, because it never looks at what is in flight. A cap looks at
 * nothing else, which also makes it self-tuning: slow requests hold their slots
 * longer, so the effective rate falls on its own exactly when it should.
 *
 * It answers the objection use-staged-warmup raised against completion-chaining
 * ("it stalls the whole train behind one slow endpoint") — a slot frees the
 * moment ANY task finishes, never when a whole wave does.
 *
 * FOREGROUND fetches do NOT come through here. A person waiting on a tap must
 * never queue behind warm-up.
 */

/**
 * How many background requests may be in flight.
 *
 * Six is the measured knee against the live API, 14 endpoints, warm connection:
 *
 *   cap  1 → 1020ms wall, 66ms median      cap  6 →  256ms wall,  82ms median
 *   cap  2 →  576ms wall, 80ms median      cap  8 →  284ms wall, 143ms median
 *   cap  4 →  341ms wall, 88ms median      cap 14 →  262ms wall, 202ms median
 *
 * Wall time bottoms out at 6 with latency still essentially unloaded. Past it
 * the wall stops improving and latency doubles — that is the herd, and it starts
 * at 8, not at 2. Re-measure before changing this; it is a number, not a taste.
 */
export const POOL_LIMIT = 6;

/**
 * How many of those six background may hold at once.
 *
 * The reserve is the whole point: with background capped BELOW the total, a slot
 * is always there for a foreground call, so a tap can never be stuck behind six
 * prefetches waiting out their 8s aborts.
 */
export const BACKGROUND_LIMIT = POOL_LIMIT - 1;

let inFlight = 0;
let bgInFlight = 0;
/** Foreground waiters jump ahead of background ones. */
const fgWaiting: (() => void)[] = [];
const bgWaiting: (() => void)[] = [];

function pump(): void {
  if (inFlight < POOL_LIMIT && fgWaiting.length) {
    fgWaiting.shift()!();
    return;
  }
  if (
    inFlight < POOL_LIMIT &&
    bgInFlight < BACKGROUND_LIMIT &&
    bgWaiting.length
  ) {
    bgWaiting.shift()!();
  }
}

/**
 * BACKGROUND — warm-up and prefetch. Waits for a slot, and never takes the last
 * one.
 */
export async function runPooled<T>(fn: () => Promise<T>): Promise<T> {
  while (inFlight >= POOL_LIMIT || bgInFlight >= BACKGROUND_LIMIT) {
    await new Promise<void>((resolve) => bgWaiting.push(resolve));
  }
  inFlight += 1;
  bgInFlight += 1;
  try {
    return await fn();
  } finally {
    // finally, not a then: a task that throws must give its slot back, or one
    // bad endpoint parks part of the pool for the life of the page.
    inFlight -= 1;
    bgInFlight -= 1;
    pump();
  }
}

/**
 * FOREGROUND — a person is waiting on this. Still capped, but first in the queue
 * and with a slot background is not allowed to take.
 *
 * It is capped rather than exempt because "foreground" is not the same as
 * "urgent" at page load: on first paint almost every request is a component
 * query, so exempting them left the page peaking at 26 concurrent with a 293ms
 * median where the measured knee is 82ms at six. Letting them queue — ahead of
 * background, never behind it — is what actually holds the line.
 */
export async function runCounted<T>(fn: () => Promise<T>): Promise<T> {
  while (inFlight >= POOL_LIMIT) {
    await new Promise<void>((resolve) => fgWaiting.push(resolve));
  }
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
    pump();
  }
}
