/**
 * config.ts — demo refresh configuration.
 *
 * `null` means "not configured", and the caller must then NOT schedule the job.
 * An unconfigured deployment being completely inert is the point: this feature
 * reads one household's real data, so it must never switch itself on by
 * default, and a missing variable must never be interpreted as a default.
 */
import { dailyMoneyScale } from "./rules";

export type DemoPair = {
  source: string;
  dest: string;
  label: string;
  /** Destination budget's default_currency. */
  currency: string;
  /** {} keeps every source currency; {PLN:"USD"} relabels. */
  currencyMap: Record<string, string>;
  budgetName: string;
  secondMemberUserId?: string;
};

export type DemoConfig = {
  pairs: DemoPair[];
  demoUserId: string;
  /** Test-only pin. Production leaves it unset and draws the daily value. */
  fixedMoneyScale?: number;
};

function list(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readDemoConfig(
  env: Record<string, string | undefined> = process.env,
): DemoConfig | null {
  const sources = list(env.DEMO_SOURCE_TENANT_IDS);
  const dests = list(env.DEMO_TENANT_IDS);
  const demoUserId = (env.DEMO_USER_ID ?? "").trim();

  if (!sources.length || !dests.length || !demoUserId) return null;

  // Mismatched lists would silently pair the wrong budgets — which, with a
  // source list that is someone's real finances, is the one misconfiguration
  // that must never be papered over.
  if (sources.length !== dests.length) return null;

  const currencies = list(env.DEMO_CURRENCIES);
  const names = list(env.DEMO_BUDGET_NAMES);
  const labels = list(env.DEMO_LABELS);

  const pairs = sources.map((source, i) => {
    const currency = (currencies[i] ?? "USD").toUpperCase();
    return {
      source,
      dest: dests[i]!,
      label: labels[i] ?? `pair-${i}`,
      currency,
      // The home currency is relabeled to the destination currency; everything
      // else passes through, so the multi-currency story still renders. An
      // identical mapping is an empty map — no relabel at all.
      currencyMap:
        currency === (env.DEMO_HOME_CURRENCY ?? "PLN").toUpperCase()
          ? {}
          : { [(env.DEMO_HOME_CURRENCY ?? "PLN").toUpperCase()]: currency },
      budgetName: names[i] ?? `Demo ${i + 1}`,
      secondMemberUserId: env.DEMO_SECOND_USER_ID?.trim() || undefined,
    };
  });

  const fixed = env.DEMO_MONEY_SCALE ? Number(env.DEMO_MONEY_SCALE) : undefined;

  return {
    pairs,
    demoUserId,
    fixedMoneyScale:
      fixed !== undefined && Number.isFinite(fixed) && fixed > 0
        ? fixed
        : undefined,
  };
}

/** The factor for one pair on one day — the daily draw unless pinned. */
export function scaleForPair(
  cfg: DemoConfig,
  pair: DemoPair,
  day: string,
): number {
  return cfg.fixedMoneyScale ?? dailyMoneyScale(day, pair.label);
}
