/**
 * budget-fetch.ts — CLIENT-safe helpers shared with server code.
 * Anything requiring next/headers lives in budget-fetch.server.ts.
 */
import { reportApiUnreachable, reportApiOk } from "./api-unreachable-bus";
import { runPooled, runCounted } from "./request-pool";

/**
 * A read has to be bounded, for the same reason a write is (offline-write's
 * 6s race) and for one more: it is holding a pool slot.
 *
 * On a SLOW link — not a dead one — `navigator.onLine` stays true, so nothing
 * is refused and nothing is reported; requests simply never come back. Opening
 * a budget that was never warmed fires the biggest burst in the app, six of
 * them stick, `inFlight` pins at POOL_LIMIT, and every later read queues behind
 * them for the life of the page. Pages that had already loaded still painted
 * their shell from the SW cache and then sat on skeletons for ever, because no
 * query under them could get a slot (user, 260829).
 *
 * The manual race is the real guarantee and the AbortSignal is best-effort, in
 * that order, because iOS WebKit does not reliably abort a hung request — the
 * same finding that shaped the write path.
 *
 * Longer than the write's 6s on purpose: a read is often part of a legitimate
 * bulk warm-up on a genuinely slow connection, and failing those early would
 * trade this wedge for spurious empty panes.
 */
const READ_RACE_MS = 10_000;
const READ_ABORT_MS = 12_000;

/** Thrown when a read outlives READ_RACE_MS. Same class of event as a network
 *  throw — the caller's query fails and the unreachable banner appears. */
export class SlowReadError extends Error {
  constructor() {
    super("slow-read");
    this.name = "SlowReadError";
  }
}

const BUDGET_PATH_RE = /^\/[a-z]{2}\/budgets\/([0-9a-fA-F-]{8,})/;

export function extractBudgetIdFromPath(pathname: string): string | null {
  const m = BUDGET_PATH_RE.exec(pathname);
  return m?.[1] ?? null;
}

/** The budget id in an API path we are about to request: `/budgets/<id>/…`.
 *  A uuid only — `/budgets/aggregate` and `/budgets/aggregate/wealth` carry no
 *  budget and must not be mistaken for one. */
const API_BUDGET_RE =
  /^\/budgets\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(\/|$)/;

export function extractBudgetIdFromApiPath(path: string): string | null {
  return API_BUDGET_RE.exec(path)?.[1] ?? null;
}

/**
 * Browser-side fetch wrapper. Attaches X-Budget-ID, which the tenant guard needs
 * on every budget-scoped call. Returns the raw Response.
 *
 * The id is taken from the REQUESTED PATH first (`/budgets/<uuid>/…`) and only
 * then from window.location. The path is what the caller actually asked for; the
 * browser URL is a guess about it, and the guess was wrong wherever a page shows
 * data for a budget it is not sitting on. The all-budgets page renders a task
 * banner per budget, each resolving category names, and with no budget in `/en`
 * every one of those calls went out with no header and came back 403
 * no_active_workspace — then retried (user screenshot, 260827).
 *
 * An explicit header still wins: a caller that knows better keeps control.
 */
/** The call itself, unqueued. Both lanes wrap this ONCE — a background call
 *  that went through a foreground wrapper would take two slots. */
async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("X-Budget-ID")) {
    const budgetId =
      extractBudgetIdFromApiPath(path) ??
      (typeof window !== "undefined"
        ? extractBudgetIdFromPath(window.location.pathname)
        : null);
    if (budgetId) headers.set("X-Budget-ID", budgetId);
  }
  // Our own controller so the timer can cancel, while a caller-supplied signal
  // still works: forward its abort into ours rather than dropping it.
  const ctl = new AbortController();
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) ctl.abort();
    else callerSignal.addEventListener("abort", () => ctl.abort(), { once: true });
  }
  const abortTimer = setTimeout(() => ctl.abort(), READ_ABORT_MS);
  let raceTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    const res = await Promise.race([
      fetch(`/api${path}`, { ...init, headers, signal: ctl.signal }),
      new Promise<never>((_, reject) => {
        raceTimer = setTimeout(() => reject(new SlowReadError()), READ_RACE_MS);
      }),
    ]);
    // 5xx ⇒ the server itself is failing; 2xx/3xx/4xx ⇒ the API is reachable
    // (4xx is auth/validation, NOT a server-down signal).
    if (res.status >= 500) reportApiUnreachable();
    else reportApiOk();
    return res;
  } catch (e) {
    // Network failure / abort / DNS / our own timeout — the API is unreachable.
    reportApiUnreachable();
    throw e;
  } finally {
    clearTimeout(abortTimer);
    if (raceTimer !== undefined) clearTimeout(raceTimer);
  }
}

/**
 * FOREGROUND: runs now, but occupies a slot so background work backs off.
 * See request-pool for why foreground is counted rather than exempt.
 */
export async function clientApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return runCounted(() => doFetch(path, init));
}

/**
 * BACKGROUND: waits for a slot — for warm-up and prefetch, which are bulk and
 * which nobody is waiting on.
 */
export async function backgroundApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return runPooled(() => doFetch(path, init));
}
