"use client";
/**
 * overview-cards.tsx — the five Overview summary cards (Phase 11, 11-08, DD-1).
 *
 * Layout: a full-width Capitalization hero card on top, then a 2-col grid of four
 * (available-to-spend, available reserves, overspent-this-month, cushion). All
 * amounts in the budget default_currency (D-11), tabular figures via `.num`. Width-
 * flexible grid (no fixed px) so there's no horizontal scroll at 375px (SC1).
 *
 * Theme: every color is a CSS-var token (--surface-card-dark / --primary /
 * --trading-down / --muted-foreground …) so the cards render correctly in BOTH the
 * dark and light themes — no hardcoded hex.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Temporal } from "temporal-polyfill";
import {
  TrendingUp,
  TrendingDown,
  CircleCheck,
  CircleAlert,
  CirclePlus,
  Hourglass,
} from "lucide-react";
import { useOverviewCards } from "@/hooks/use-overview-cards";
import { useOverviewWealth } from "@/hooks/use-overview-wealth";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { centsToDisplayCompact, centsToRounded } from "@/lib/cents-format";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { cn } from "@/lib/utils";

/**
 * Count-tween any card figure so it rolls up/down when fresh data replaces the
 * cached snapshot (round 16 item 1) — the reserves "cover" reveal, generalized.
 * `value` is the raw number (cents / pct / months); `format` turns the tweened
 * float into the displayed string.
 */
function AnimatedFigure({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  return <>{format(useAnimatedNumber(value))}</>;
}

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-[var(--muted-foreground)]">{children}</p>
  );
}

/**
 * Cushion runway as years/months/days, dropping any zero component (UAT round,
 * Phase 11): 0 → "0d", 6 months → "6m", 5 months 3 days → "5m 3d", 15 months →
 * "1y 3m". 30.44 = mean days/month; a fraction that rounds to a full month carries
 * up so we never render "5m 30d", and 12 months roll into a year.
 */
function formatRunway(
  realMonths: number,
  units: { y: string; m: string; d: string },
): string {
  const safe = Number.isFinite(realMonths) ? Math.max(0, realMonths) : 0;
  let months = Math.floor(safe);
  let days = Math.round((safe - months) * 30.44);
  if (days >= 30) {
    months += 1;
    days = 0;
  }
  const years = Math.floor(months / 12);
  months = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years}${units.y}`);
  if (months) parts.push(`${months}${units.m}`);
  if (days) parts.push(`${days}${units.d}`);
  return parts.length ? parts.join(" ") : `0${units.d}`;
}

/** Shrink the hero number's font as the string grows so a big value still leaves
 * room for the P/L beside it (item 1). */
function heroFontClass(s: string): string {
  if (s.length >= 13) return "text-[24px] font-bold leading-[1.1]";
  if (s.length >= 10) return "text-[32px] font-bold leading-[1.1]";
  return "text-num-display";
}

export function OverviewCards({
  budgetId,
  reservesEnabled = true,
  investmentsEnabled = true,
}: {
  budgetId: string;
  reservesEnabled?: boolean;
  investmentsEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview");
  const tz = useUserTimezone();
  const { data, isError, isPending } = useOverviewCards(budgetId);
  // Capitalization card flips to reveal the retirement runway on its back (item 9).
  const [flipped, setFlipped] = useState(false);

  /** "5 years and 6 months" — fully localized (ICU plurals) for the flip back. */
  const retirementFull = (totalMonths: number): string => {
    const total = Math.max(0, Math.round(totalMonths));
    const years = Math.floor(total / 12);
    const months = total % 12;
    const y = years ? t("cards.years", { count: years }) : null;
    const m = months ? t("cards.months", { count: months }) : null;
    if (y && m) return `${y} ${t("cards.and")} ${m}`;
    return y ?? m ?? t("cards.months", { count: 0 });
  };

  // Capitalization P/L vs the PREVIOUS DAY — the hero card stays a simple day P/L
  // (the range-scoped "since period start" view lives inside Financial Wealth, not
  // here). Trailing-1-day range, capitalization view; grow.delta = net-worth change
  // off the hourly snapshots + live point.
  const plRange = useMemo(() => {
    const today = Temporal.Now.plainDateISO(tz);
    return {
      from: today.subtract({ days: 1 }).toString(),
      to: today.toString(),
    };
  }, [tz]);
  const pl = useOverviewWealth(budgetId, {
    from: plRange.from,
    to: plRange.to,
    view: "capitalization",
    enabled: true,
  }).data?.grow;

  if (isPending) {
    return (
      <div data-testid="overview-cards" className="flex flex-col gap-3">
        <div className={`${CARD} h-28 animate-pulse`} />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${CARD} h-24 animate-pulse`} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div data-testid="overview-cards" className={CARD}>
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.planned")}
        </p>
      </div>
    );
  }

  const ccy = data.default_currency;
  // Overview money always renders with the EN locale so the currency symbol ($,
  // €, …) shows instead of the ISO code (PL/UK render USD as "$", not "USD") and
  // grouping matches the English surfaces (UAT round, item 6).
  const money = (cents: string) => centsToDisplayCompact(cents, ccy, "en");
  // Animated variants — the figure counts to its new value when data refreshes.
  const animMoney = (cents: string) => (
    <AnimatedFigure
      value={Number(cents)}
      format={(n) => money(String(Math.round(n)))}
    />
  );
  const animRounded = (cents: string) => (
    <AnimatedFigure
      value={Number(cents)}
      format={(n) => centsToRounded(String(Math.round(n)), ccy)}
    />
  );
  // Localized cushion-runway unit suffixes (item 4): EN y/m/d, UK р/м/д, PL l/m/d.
  const runwayUnits = {
    y: t("cards.unitY"),
    m: t("cards.unitM"),
    d: t("cards.unitD"),
  };
  // "incl. investments" only when the Investments feature is ON and there's value
  // to show — disabling the feature drops the sub-line even if holdings still value.
  const hasInvestments =
    investmentsEnabled && BigInt(data.investment_value_cents) > 0n;
  const overspentCount = data.overspent.count;
  const topNames = data.overspent.top.map((o) => o.name).join(" · ");

  return (
    <div data-testid="overview-cards" className="flex flex-col gap-3">
      {/* Hero: Capitalization (net worth) — a FLIP card. Front = the big yellow
          figure + P/L; tapping it rotates horizontally to the back, which shows the
          retirement runway ("if you retire now …"). The front sits in normal flow
          so it sets the card height; the back is absolutely overlaid + pre-rotated
          (UAT item 9). Only flippable when a retirement runway exists. */}
      {(() => {
        const canFlip = data.retirement_months !== null;
        const isFlipped = canFlip && flipped;
        return (
          <section
            data-testid="overview-card-capitalization"
            className={cn(
              CARD,
              "[perspective:1200px]",
              canFlip && "cursor-pointer select-none",
            )}
            {...(canFlip && {
              role: "button",
              tabIndex: 0,
              "aria-label": t("cards.flipToRetirement"),
              onClick: () => setFlipped((f) => !f),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFlipped((f) => !f);
                }
              },
            })}
          >
            <div
              className="relative transition-transform duration-500 [transform-style:preserve-3d]"
              style={{
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* FRONT — capitalization (in flow → defines the card height) */}
              <div className="[backface-visibility:hidden]">
                <CardLabel>{t("cards.capitalization")}</CardLabel>
                <div className="mt-1 flex flex-wrap items-stretch justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 flex-col justify-between gap-1">
                    <p
                      // Inline color: tailwind-merge can't tell the custom
                      // `text-num-display` size class from a text-color and was
                      // dropping `text-[var(--primary)]`, rendering the number grey.
                      // An inline style bypasses the merge entirely (UAT item 3).
                      style={{ color: "var(--primary)" }}
                      className={cn(
                        "num",
                        heroFontClass(
                          centsToRounded(data.capitalization_cents, ccy),
                        ),
                      )}
                    >
                      {animRounded(data.capitalization_cents)}
                    </p>
                    {hasInvestments && (
                      <p className="text-caption text-[var(--muted-foreground)]">
                        {t("cards.capitalizationSub", {
                          // No cents — match the hero capitalization number.
                          amount: centsToRounded(
                            data.investment_value_cents,
                            ccy,
                          ),
                        })}
                      </p>
                    )}
                  </div>
                  {pl && pl.delta_pct !== null && (
                    <div
                      className={cn(
                        "text-caption flex shrink-0 flex-col items-end justify-between gap-0.5 text-right",
                        Number(pl.delta_cents) >= 0
                          ? "text-[var(--trading-up)]"
                          : "text-[var(--trading-down)]",
                      )}
                    >
                      <span className="num flex items-center gap-1">
                        {Number(pl.delta_cents) >= 0 ? (
                          <TrendingUp
                            className="size-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <TrendingDown
                            className="size-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <AnimatedFigure
                          value={pl.delta_pct}
                          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
                        />
                      </span>
                      <span className="num">{animRounded(pl.delta_cents)}</span>
                      <span className="text-[10px] leading-tight text-[var(--muted-foreground)]">
                        {t("cards.sinceYesterday")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* BACK — retirement runway ("if you retire now, your money will last
                  for {N years and M months}"), inflation-adjusted (item 8). */}
              {canFlip && (
                <div
                  data-testid="overview-card-retirement"
                  className="absolute inset-0 flex flex-col justify-between [backface-visibility:hidden] [transform:rotateY(180deg)]"
                >
                  <CardLabel>{t("cards.retirementRunway")}</CardLabel>
                  <div className="flex items-center gap-2">
                    <Hourglass
                      className="size-5 shrink-0 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                    <span className="text-title-md font-semibold text-[var(--body-on-dark)]">
                      {retirementFull(data.retirement_months as number)}
                    </span>
                  </div>
                  <p className="text-caption text-[var(--muted-foreground)]">
                    {t("cards.retirementInflation", {
                      pct: data.retirement_inflation_pct,
                    })}
                  </p>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      <div className="grid grid-cols-2 gap-3">
        {/* Available to spend (item 1): wallet cash on top with a good/bad dot
            (green when the wallets cover what's left to spend, red when short),
            then spent-this-month + left-to-spend below. */}
        <section
          data-testid="overview-card-available-to-spend"
          className={CARD}
        >
          <CardLabel>{t("cards.availableToSpend")}</CardLabel>
          <p className="num text-title-md mt-1 flex items-center gap-1.5 text-[var(--body-on-dark)]">
            {data.spendings.good ? (
              <CircleCheck
                data-testid="spend-good"
                className="size-4 shrink-0 text-[var(--trading-up)]"
                aria-label={t("cards.spendGood")}
              />
            ) : (
              <CircleAlert
                data-testid="spend-bad"
                className="size-4 shrink-0 text-[var(--trading-down)]"
                aria-label={t("cards.spendBad")}
              />
            )}
            <span className="truncate">
              {animMoney(data.spendings.wallet_cents)}
            </span>
          </p>
          <dl className="text-caption mt-1.5 flex flex-col gap-0.5 text-[var(--muted-foreground)]">
            <div className="flex items-center justify-between gap-2">
              <dt>{t("cards.spentThisMonth")}</dt>
              <dd className="num text-[var(--body-on-dark)]">
                {animMoney(data.spendings.spent_cents)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>{t("cards.leftToSpend")}</dt>
              <dd className="num text-[var(--body-on-dark)]">
                {animMoney(data.spendings.left_cents)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Available reserves — hidden when the reserves feature flag is off
            (mirrors the hidden Reserves pill + section). Indicator (item 3):
            green when wallets exactly cover the required reserve, red when short,
            yellow when there's more reserve than needed. */}
        {reservesEnabled && (
          <section
            data-testid="overview-card-available-reserves"
            className={CARD}
          >
            <CardLabel>{t("cards.availableReserves")}</CardLabel>
            <p className="num text-title-md mt-1 flex items-center gap-1.5 text-[var(--body-on-dark)]">
              {data.reserves.status === "ok" ? (
                <CircleCheck
                  data-testid="reserves-ok"
                  className="size-4 shrink-0 text-[var(--trading-up)]"
                  aria-label={t("cards.reservesOk")}
                />
              ) : data.reserves.status === "short" ? (
                <CircleAlert
                  data-testid="reserves-short"
                  className="size-4 shrink-0 text-[var(--trading-down)]"
                  aria-label={t("cards.reservesShort")}
                />
              ) : (
                <CirclePlus
                  data-testid="reserves-surplus"
                  className="size-4 shrink-0 text-[var(--warning)]"
                  aria-label={t("cards.reservesSurplus")}
                />
              )}
              <span className="truncate">
                {animMoney(data.available_reserves_cents)}
              </span>
            </p>
            <p className="text-caption mt-1.5 text-[var(--muted-foreground)]">
              {t(
                data.reserves.status === "surplus"
                  ? "cards.reservesSurplusNote"
                  : data.reserves.status === "short"
                    ? "cards.reservesShortNote"
                    : "cards.reservesOkNote",
                { amount: money(data.reserves.required_cents) },
              )}
            </p>
          </section>
        )}

        {/* Overspent (item 5): clean → green "$0" + a motivational line; over →
            red TOTAL overspend amount + the list of overspent categories. */}
        <section data-testid="overview-card-overspent" className={CARD}>
          <CardLabel>{t("cards.overspent")}</CardLabel>
          {overspentCount === 0 ? (
            <>
              <p className="num text-title-md mt-1 flex items-center gap-1.5 text-[var(--body-on-dark)]">
                <CircleCheck
                  data-testid="overspent-ok"
                  className="size-4 shrink-0 text-[var(--trading-up)]"
                  aria-hidden="true"
                />
                {money("0")}
              </p>
              <p className="text-caption mt-1.5 text-[var(--muted-foreground)]">
                {t("cards.overspentMotivation")}
              </p>
            </>
          ) : (
            <>
              <p className="num text-title-md mt-1 flex items-center gap-1.5 text-[var(--body-on-dark)]">
                <CircleAlert
                  data-testid="overspent-bad"
                  className="size-4 shrink-0 text-[var(--trading-down)]"
                  aria-hidden="true"
                />
                {animMoney(data.overspent.total_cents)}
              </p>
              {topNames && (
                <p className="text-caption mt-1.5 text-[var(--muted-foreground)]">
                  {topNames}
                </p>
              )}
            </>
          )}
        </section>

        {/* Cushion — runway as "Xm Yd" + total. Hidden entirely when the
            cushion feature flag is off (cushion.enabled === false), so no
            cushion-related info shows on budgets that don't use it. */}
        {data.cushion.enabled && (
          <section data-testid="overview-card-cushion" className={CARD}>
            <CardLabel>{t("cards.cushion")}</CardLabel>
            <p className="num text-title-md mt-1 flex items-center gap-1.5 text-[var(--body-on-dark)]">
              {/* Circle icon to match the other cards (item 6): green check when
                  the cushion meets its required limit, red alert when short. */}
              {data.cushion.covered ? (
                <CircleCheck
                  data-testid="cushion-covered"
                  className="size-4 shrink-0 text-[var(--trading-up)]"
                  aria-label={t("cards.cushionCovered")}
                />
              ) : (
                <CircleAlert
                  data-testid="cushion-short"
                  className="size-4 shrink-0 text-[var(--trading-down)]"
                  aria-label={t("cards.cushionShort")}
                />
              )}
              <span className="truncate">
                <AnimatedFigure
                  value={data.cushion.real_months}
                  format={(n) => formatRunway(n, runwayUnits)}
                />
              </span>
            </p>
            {/* Have vs needed to cover the threshold (item 5). */}
            <dl className="text-caption mt-1.5 flex flex-col gap-0.5 text-[var(--muted-foreground)]">
              <div className="flex items-center justify-between gap-2">
                <dt>{t("cards.cushionSaved")}</dt>
                <dd className="num text-[var(--body-on-dark)]">
                  {animMoney(data.cushion.total_cents)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>{t("cards.cushionNeeded")}</dt>
                <dd className="num text-[var(--body-on-dark)]">
                  {animMoney(data.cushion.required_cents)}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
