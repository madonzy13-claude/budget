/**
 * settings-progress.ts — "budget configuration completeness" checklist for the
 * Settings header (r34). Ten items, 10% each (sum 100). The header shows the
 * percent + a motivational message; a popup lists every item as done / to-do.
 *
 * A disabled feature simply leaves its item(s) not-done → their weight is missing
 * from the total. Identity is always done (a budget always has a name + currency).
 */
export type SettingsItemKey =
  | "identity"
  | "transaction"
  | "cushionEnabled"
  | "cushionWallet"
  | "reservesEnabled"
  | "reserveWallet"
  | "investmentsEnabled"
  | "investment"
  | "recurring"
  | "income"
  | "category";

export interface SettingsProgressInput {
  /** ≥1 transaction recorded (from budget.hasTransactions). */
  hasTransaction: boolean;
  cushionEnabled: boolean;
  hasCushionWallet: boolean;
  reservesEnabled: boolean;
  hasReserveWallet: boolean;
  investmentsEnabled: boolean;
  hasInvestment: boolean;
  hasRecurring: boolean;
  hasIncome: boolean;
  /** ≥1 non-investment category exists. */
  hasCategory: boolean;
}

export interface SettingsChecklistItem {
  key: SettingsItemKey;
  done: boolean;
  weight: number;
}

export interface SettingsProgress {
  /** 0..100, integer. */
  percent: number;
  items: SettingsChecklistItem[];
}

/**
 * Weights sum to 100: identity 5 + first transaction 5 + the nine feature/entry
 * items at 10 each.
 *
 * When a feature is OFF its wallet/investment step is HIDDEN in the app, so it's
 * dropped from the checklist AND never counts (even if a wallet/holding still
 * exists behind the disabled toggle) — those percents are simply unreachable until
 * the feature is turned back on.
 */
export function computeSettingsProgress(
  i: SettingsProgressInput,
): SettingsProgress {
  const items: SettingsChecklistItem[] = [
    { key: "identity", done: true, weight: 5 }, // name + currency always exist
    { key: "transaction", done: i.hasTransaction, weight: 5 },
    { key: "cushionEnabled", done: i.cushionEnabled, weight: 10 },
    ...(i.cushionEnabled
      ? [
          {
            key: "cushionWallet" as const,
            done: i.hasCushionWallet,
            weight: 10,
          },
        ]
      : []),
    { key: "reservesEnabled", done: i.reservesEnabled, weight: 10 },
    ...(i.reservesEnabled
      ? [
          {
            key: "reserveWallet" as const,
            done: i.hasReserveWallet,
            weight: 10,
          },
        ]
      : []),
    { key: "investmentsEnabled", done: i.investmentsEnabled, weight: 10 },
    ...(i.investmentsEnabled
      ? [{ key: "investment" as const, done: i.hasInvestment, weight: 10 }]
      : []),
    { key: "recurring", done: i.hasRecurring, weight: 10 },
    { key: "income", done: i.hasIncome, weight: 10 },
    { key: "category", done: i.hasCategory, weight: 10 },
  ];
  const percent = items.reduce((s, x) => s + (x.done ? x.weight : 0), 0);
  return { percent, items };
}

export type SettingsProgressTier = "start" | "low" | "mid" | "high" | "done";

/** Motivational message tier by percent (copy in i18n settings.progress.msg.*). */
export function settingsProgressTier(percent: number): SettingsProgressTier {
  if (percent >= 100) return "done";
  if (percent >= 75) return "high";
  if (percent >= 50) return "mid";
  if (percent >= 25) return "low";
  return "start";
}
