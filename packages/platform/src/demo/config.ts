/**
 * config.ts — demo refresh configuration.
 *
 * `null` means "not configured", and the caller must then NOT schedule the job.
 * An unconfigured deployment being completely inert is the point: this feature
 * reads one household's real data, so it must never switch itself on by
 * default, and a missing variable must never be interpreted as a default.
 *
 * ONE ACCOUNT PER LANGUAGE. The demo's data — category names, transaction
 * notes, wallets, incomes — is written into the database in one language, so a
 * single shared account cannot serve three. Each locale therefore gets its own
 * demo user and its own pair of budgets, and `/[locale]/demo` signs the visitor
 * into the account for that language. The locale-specific variables fall back
 * to the single-locale ones, so a deployment configured before this existed
 * keeps working as the English demo.
 */
import { dailyMoneyScale } from "./rules";
import {
  demoLocales,
  isDemoLocale,
  poolValues,
  type DemoLocale,
} from "./pools";

export type DemoPair = {
  source: string;
  dest: string;
  label: string;
  /** Destination budget's default_currency. */
  currency: string;
  /** {} keeps every source currency; {PLN:"USD"} relabels. */
  currencyMap: Record<string, string>;
  budgetName: string;
  /** The account that owns this budget — one per language. */
  demoUserId: string;
  secondMemberUserId?: string;
  /** Which language this budget's DATA is written in. */
  textLocale: DemoLocale;
};

export type DemoConfig = {
  pairs: DemoPair[];
  /** Every demo account, for the guard and the outbound suppression. */
  userIds: string[];
  /** locale → the account to sign in as at /[locale]/demo. */
  userByLocale: Record<string, string>;
  /** Test-only pin. Production leaves it unset and draws the daily value. */
  fixedMoneyScale?: number;
};

function list(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pick(
  env: Record<string, string | undefined>,
  base: string,
  locale: string,
): string | undefined {
  // DEMO_USER_ID_PL wins; DEMO_USER_ID is the pre-multi-locale fallback.
  return env[`${base}_${locale.toUpperCase()}`] ?? env[base];
}

export function readDemoConfig(
  env: Record<string, string | undefined> = process.env,
): DemoConfig | null {
  const sources = list(env.DEMO_SOURCE_TENANT_IDS);
  if (!sources.length) return null;

  const locales = (
    list(env.DEMO_LOCALES).length ? list(env.DEMO_LOCALES) : ["en"]
  ).filter(isDemoLocale) as DemoLocale[];
  if (!locales.length) return null;

  const currencies = list(env.DEMO_CURRENCIES);
  const labels = list(env.DEMO_LABELS);
  const sharedLabels = new Set(list(env.DEMO_SHARED_LABELS));
  const home = (env.DEMO_HOME_CURRENCY ?? "PLN").toUpperCase();

  const pairs: DemoPair[] = [];
  const userByLocale: Record<string, string> = {};

  for (const locale of locales) {
    const dests = list(pick(env, "DEMO_TENANT_IDS", locale));
    const userId = (pick(env, "DEMO_USER_ID", locale) ?? "").trim();
    const secondUserId = (
      pick(env, "DEMO_SECOND_USER_ID", locale) ?? ""
    ).trim();

    // A locale that is not fully configured is SKIPPED, not guessed at. Half a
    // demo account is worse than none: it would sign visitors into an empty or
    // half-copied budget.
    if (!userId || dests.length !== sources.length) continue;

    userByLocale[locale] = userId;
    // Budget names come from the locale's own vocabulary, so the Polish demo
    // says "Osobisty" rather than "Personal".
    const budgetNames = poolValues(locale, "budget");

    sources.forEach((source, i) => {
      const currency = (currencies[i] ?? "USD").toUpperCase();
      const label = labels[i] ?? `pair-${i}`;
      pairs.push({
        source,
        dest: dests[i]!,
        label: `${label}-${locale}`,
        currency,
        // The home currency is relabeled to the destination currency;
        // everything else passes through, so the multi-currency story still
        // renders. An identical mapping is an empty map — no relabel at all.
        currencyMap: currency === home ? {} : { [home]: currency },
        budgetName: budgetNames[i] ?? `Demo ${i + 1}`,
        demoUserId: userId,
        secondMemberUserId: sharedLabels.has(label)
          ? secondUserId || undefined
          : undefined,
        textLocale: locale,
      });
    });
  }

  if (!pairs.length) return null;

  const fixed = env.DEMO_MONEY_SCALE ? Number(env.DEMO_MONEY_SCALE) : undefined;

  return {
    pairs,
    userIds: [
      ...new Set(
        pairs.flatMap((p) =>
          [p.demoUserId, p.secondMemberUserId].filter(Boolean),
        ),
      ),
    ] as string[],
    userByLocale,
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

/** Is this user one of the demo accounts? */
export function isDemoUser(
  userId: string | undefined,
  cfg: DemoConfig | null = readDemoConfig(),
): boolean {
  if (!userId || !cfg) return false;
  return cfg.userIds.includes(userId);
}

/** Is this tenant one of the demo budgets? */
export function isDemoTenantId(
  tenantId: string | undefined,
  cfg: DemoConfig | null = readDemoConfig(),
): boolean {
  if (!tenantId || !cfg) return false;
  return cfg.pairs.some((p) => p.dest === tenantId);
}

export { demoLocales };
