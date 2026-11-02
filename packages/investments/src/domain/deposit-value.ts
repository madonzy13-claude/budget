import Big from "big.js";

// A bank deposit accrues interest at an annual rate, compounding ("capitalizing")
// on a fixed cadence. Between capitalizations the value still creeps up every day
// (simple accrual on the current base); on each capitalization boundary the
// accrued interest folds into the base so future interest earns on top of it —
// exactly how a bank statement behaves. The whole thing is a deterministic
// function of (principal, rate, start, cadence, as-of) so we compute it on read;
// no daily job, and re-reading after a capitalization can never "lose" earnings
// because the base is always rebuilt from the start date.
//
// Day count is actual/365 fixed. If an end (maturity) date is set the value
// freezes there — it keeps every cent earned but stops accruing.

export type CapFrequency =
  "daily" | "monthly" | "quarterly" | "semiannual" | "yearly";

export const CAP_FREQUENCIES: CapFrequency[] = [
  "daily",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
];

const MONTHS_PER_STEP: Record<Exclude<CapFrequency, "daily">, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export interface DepositInput {
  principalCents: bigint | string | number;
  rateBps: number; // annual rate in basis points (e.g. 525 = 5.25%)
  startDate: string; // 'YYYY-MM-DD' (first day interest starts accruing)
  capFrequency: CapFrequency;
  asOf: string; // 'YYYY-MM-DD' (the day we're valuing at, usually today)
  endDate?: string | null; // 'YYYY-MM-DD' maturity; value freezes on/after it
}

// Calendar math as plain integers: this runs for every deposit on every
// holdings read, and temporal-polyfill's `until` dominated the profile
// (261102). Semantics are Temporal.PlainDate's, pinned by
// deposit-value-fast.test.ts: strict ISO dates (a bad one throws RangeError)
// and month addition that clamps to the month's last day (Jan 31 + 1 month =
// Feb 28/29).
interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

const daysInMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

function parseDate(s: string): Ymd {
  const hit = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s);
  const [y, m, d] = hit ? [+hit[1]!, +hit[2]!, +hit[3]!] : [0, 0, 0];
  if (!hit || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m))
    throw new RangeError(`invalid date: ${s}`);
  return { y, m, d };
}

// ponytail: Date.UTC maps years 0-99 to 1900-1999; no deposit dates from then.
const epochDay = ({ y, m, d }: Ymd) => Date.UTC(y, m - 1, d) / 86_400_000;

function addMonths({ y, m, d }: Ymd, months: number): Ymd {
  const z = y * 12 + (m - 1) + months;
  const ny = Math.floor(z / 12);
  const nm = (z % 12) + 1;
  return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
}

// factor^n by squaring, every intermediate rounded to POW_DP places. big.js's
// own pow is exact, so a 20-place factor raised to n carries 20·n digits —
// ~200k at 30 years, and the CPU profile's top frame. 40 places leaves ~20
// digits of headroom over the 1e12-cent principal; the cents match the exact
// result across principal ≤ 1e12, rate ≤ 10000 bps, ≤ 30 years
// (deposit-value-fast.test.ts).
const POW_DP = 40;
function powRounded(base: Big, n: number): Big {
  let result = new Big(1);
  let x = base;
  for (let k = n; k > 0; k = Math.floor(k / 2)) {
    if (k % 2 === 1) result = result.times(x).round(POW_DP);
    if (k > 1) x = x.times(x).round(POW_DP);
  }
  return result;
}

// Interest accrued over a span of `days` on `base` at annual fraction `r`,
// actual/365. Returned as a Big so callers keep full precision until the final
// round — rounding mid-compound would drift.
function accrue(base: Big, r: Big, days: number): Big {
  return base.plus(base.times(r).times(days).div(365));
}

/**
 * Current value of a deposit, in integer cents (as a string, matching the
 * domain's money-as-string convention). Always >= principal.
 */
export function computeDepositValueCents(input: DepositInput): string {
  const principal = new Big(String(input.principalCents));
  const r = new Big(input.rateBps).div(10000);
  const start = parseDate(input.startDate);
  const startDay = epochDay(start);

  let asOfDay = epochDay(parseDate(input.asOf));
  if (input.endDate) {
    const endDay = epochDay(parseDate(input.endDate));
    if (asOfDay > endDay) asOfDay = endDay; // freeze at maturity
  }

  // Not started yet (or exactly on the start day): nothing has accrued.
  if (asOfDay <= startDay || input.rateBps === 0) {
    return principal.round(0, Big.roundHalfUp).toFixed(0);
  }

  // Daily capitalization is uniform (every period is exactly one day), so use the
  // closed form instead of looping thousands of times over multi-year deposits.
  if (input.capFrequency === "daily") {
    const factor = new Big(1).plus(r.div(365));
    return principal
      .times(powRounded(factor, asOfDay - startDay))
      .round(0, Big.roundHalfUp)
      .toFixed(0);
  }

  const months = MONTHS_PER_STEP[input.capFrequency];
  let base = principal;
  let cursor = start;
  let cursorDay = startDay;
  // Fold in every full capitalization period that has completed by `asOf`.
  // Each step adds to the CLAMPED cursor, as Temporal's add did: Jan 31 →
  // Feb 28 → Mar 28.
  for (;;) {
    const next = addMonths(cursor, months);
    const nextDay = epochDay(next);
    if (nextDay > asOfDay) break;
    base = accrue(base, r, nextDay - cursorDay);
    cursor = next;
    cursorDay = nextDay;
  }
  // Simple accrual for the partial period since the last capitalization.
  const value = accrue(base, r, asOfDay - cursorDay);
  return value.round(0, Big.roundHalfUp).toFixed(0);
}

/** Accrued interest = current value − principal, in integer cents (string). */
export function computeDepositAccruedCents(input: DepositInput): string {
  const value = new Big(computeDepositValueCents(input));
  return value.minus(new Big(String(input.principalCents))).toFixed(0);
}
