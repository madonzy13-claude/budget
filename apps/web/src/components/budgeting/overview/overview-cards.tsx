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
  Circle,
  CircleCheck,
  CircleAlert,
  CirclePlus,
  Hourglass,
  Eye,
  EyeOff,
} from "lucide-react";
import { usePrivacyReveal } from "@/components/budgeting/bdp-ui-state";
import { useOverviewCards } from "@/hooks/use-overview-cards";
import { useOverviewWealth } from "@/hooks/use-overview-wealth";
import { useProjection } from "@/hooks/use-projection";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { centsToDisplayCompact, centsToRounded } from "@/lib/cents-format";
import { dayCloseDelta } from "@/lib/day-close-delta";
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
 * Redaction bar — a solid rounded block that covers a hidden amount. Inherits the
 * figure's font (em-relative height) and is sized to the real figure's character
 * count (`ch`) so revealing/hiding doesn't shift the layout. Used for the privacy
 * toggle instead of a blur (a `filter` on the card breaks the capitalization flip).
 */
function RedactionBar({ chars }: { chars: number }) {
  return (
    <span
      aria-hidden="true"
      data-testid="redaction-bar"
      className="inline-block max-w-full translate-y-[-0.06em] rounded-[var(--radius-sm)] bg-[var(--surface-elevated-dark)] align-middle"
      style={{ width: `${Math.max(2, chars)}ch`, height: "0.7em" }}
    />
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
  amountPrivacyEnabled = true,
}: {
  budgetId: string;
  reservesEnabled?: boolean;
  investmentsEnabled?: boolean;
  /** r36: when false, amounts are always visible and the eye toggle is hidden. */
  amountPrivacyEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview");
  const tz = useUserTimezone();
  const { data, isError, isPending } = useOverviewCards(budgetId);
  // Available-to-spend health (dot + surplus/deficit) comes from the cash-flow
  // projection so it accounts for upcoming income to the last pay-day of the window
  // (the ProjectionTimeline sibling already fetches this; React Query dedupes).
  const { data: projection } = useProjection(budgetId);
  // Capitalization card flips to reveal the retirement runway on its back (item 9).
  const [flipped, setFlipped] = useState(false);
  // Amount privacy (per-budget flag). When ON, figures start hidden (redaction
  // bars) with an eye to reveal (auto-re-hides after 30 min idle — see
  // usePrivacyReveal). When OFF, amounts are always visible and there's no eye.
  const { revealed: rawRevealed, toggle: togglePrivacy } = usePrivacyReveal();
  const revealed = amountPrivacyEnabled ? rawRevealed : true;

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

  // Capitalization day P/L = change since the viewer's LOCAL midnight (= yesterday's
  // close in their timezone), NOT a rolling ~24h/29h window. We fetch the hourly
  // capitalization series over a trailing 1-day range (covers every tz's midnight)
  // and anchor the delta on the local-midnight bucket client-side — see
  // dayCloseDelta. (The endpoint's own `grow` anchors on the first in-range bucket,
  // which spans yesterday too, and is UTC-only.)
  const plRange = useMemo(() => {
    const today = Temporal.Now.plainDateISO(tz);
    return {
      from: today.subtract({ days: 1 }).toString(),
      to: today.toString(),
    };
  }, [tz]);
  const plSeries = useOverviewWealth(budgetId, {
    from: plRange.from,
    to: plRange.to,
    view: "capitalization",
    enabled: true,
  }).data?.series;
  const pl = useMemo(
    () => (plSeries ? dayCloseDelta(plSeries, tz, Date.now()) : undefined),
    [plSeries, tz],
  );

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
  // Overview money always renders with the EN locale + narrow symbol so the SHORT
  // currency sign shows ("$", "€", "zł", "₴") instead of the ISO code Intl falls
  // back to for many currencies in `en` ("PLN"/"UAH"); grouping matches the English
  // surfaces (UAT round, item 6).
  const fmtMoney = (cents: string) =>
    centsToDisplayCompact(cents, ccy, "en", true);
  const fmtRounded = (cents: string) => centsToRounded(cents, ccy, "en", true);
  // Privacy: when hidden, every figure is covered by a REDACTION BAR (a solid
  // rounded block sized to the real figure so the layout doesn't jump) instead of
  // the number. A bar (vs blur) leaves NO `filter` on the card, which is what
  // defeated the capitalization flip's backface-visibility.
  const hide = !revealed;
  // Node formatters — count-tween when revealed; a redaction bar when hidden.
  const animMoney = (cents: string) =>
    hide ? (
      <RedactionBar chars={fmtMoney(cents).length} />
    ) : (
      <AnimatedFigure
        value={Number(cents)}
        format={(n) => fmtMoney(String(Math.round(n)))}
      />
    );
  const animRounded = (cents: string) =>
    hide ? (
      <RedactionBar chars={fmtRounded(cents).length} />
    ) : (
      <AnimatedFigure
        value={Number(cents)}
        format={(n) => fmtRounded(String(Math.round(n)))}
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
  // Available-to-spend health from the projection. Dot: green (good), red (short),
  // or grey when there's no upcoming income (good null) or the projection hasn't
  // loaded yet. Surplus/deficit (cash on the day before the NEAREST income) only
  // shows when there IS upcoming income; otherwise the card keeps the old
  // "upcoming" figure. `good`/value are null with no income.
  const spendHealth = projection?.spend_health;
  const spendGood = spendHealth ? spendHealth.good : null;
  const sdRaw = spendHealth?.surplus_deficit_cents ?? null;
  const surplusDeficit = sdRaw !== null ? BigInt(sdRaw) : null;
  const isDeficit = surplusDeficit !== null && surplusDeficit < 0n;

  return (
    <div
      data-testid="overview-cards"
      // data-hidden reflects the privacy toggle (used by tests); the actual hiding
      // is per-figure masking (fmt helpers above), not a CSS filter — a filter on
      // the card defeats the capitalization flip's backface-visibility.
      className="flex flex-col gap-3"
      data-hidden={!revealed}
    >
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
              "relative [perspective:1200px]",
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
            {/* Privacy eye — only when the amount-privacy flag is on. A direct
                child of the section (OUTSIDE the rotating 3D wrapper) so it stays
                put during the flip and never rides the rotateY. stopPropagation
                keeps a tap from also flipping the card. */}
            {amountPrivacyEnabled && (
              <button
                type="button"
                data-testid="privacy-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePrivacy();
                }}
                onKeyDown={(e) => e.stopPropagation()}
                aria-pressed={revealed}
                aria-label={
                  revealed ? t("cards.privacyHide") : t("cards.privacyShow")
                }
                className="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]"
              >
                {revealed ? (
                  <Eye className="size-4" aria-hidden="true" />
                ) : (
                  <EyeOff className="size-4" aria-hidden="true" />
                )}
              </button>
            )}
            <div
              className="relative transition-transform duration-500 [transform-style:preserve-3d]"
              style={{
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* FRONT — capitalization (in flow → defines the card height) */}
              <div className="[backface-visibility:hidden]">
                <CardLabel>{t("cards.capitalization")}</CardLabel>
                {/* nowrap: the P/L stays inline (right) at all times. The left
                    column flex-shrinks (min-w-0) and the hero number / its privacy
                    RedactionBar (max-w-full) cap within it — otherwise a wide
                    redaction bar wrapped the P/L onto its own line (privacy mode). */}
                <div className="mt-1 flex flex-nowrap items-start justify-between gap-x-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p
                      // Inline color: tailwind-merge can't tell the custom
                      // `text-num-display` size class from a text-color and was
                      // dropping the color class, rendering the number grey. An
                      // inline style bypasses the merge entirely (UAT item 3).
                      // --num-hero = brand yellow (dark) → dark gold (light) so it
                      // stays legible on the pale light card.
                      style={{ color: "var(--num-hero)" }}
                      className={cn(
                        "num",
                        heroFontClass(
                          centsToRounded(
                            data.capitalization_cents,
                            ccy,
                            "en",
                            true,
                          ),
                        ),
                      )}
                    >
                      {animRounded(data.capitalization_cents)}
                    </p>
                    {hasInvestments && (
                      <p className="text-caption text-[var(--muted-foreground)]">
                        {t.rich("cards.capitalizationSub", {
                          // No cents — match the hero capitalization number.
                          amount: fmtRounded(data.investment_value_cents),
                          amt: (chunks) =>
                            hide ? (
                              <RedactionBar
                                chars={
                                  fmtRounded(data.investment_value_cents).length
                                }
                              />
                            ) : (
                              <>{chunks}</>
                            ),
                        })}
                      </p>
                    )}
                  </div>
                  {pl && pl.delta_pct !== null && (
                    <div
                      className={cn(
                        // Top-aligned tight stack: the P/L % sits level with the top
                        // of the hero number, $ and "since" hug beneath it. mt-0.5
                        // nudges it just clear of the privacy eye in the corner.
                        "text-caption mt-0.5 flex shrink-0 flex-col items-end gap-0.5 text-right",
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
                        {hide ? (
                          <RedactionBar
                            chars={
                              `${pl.delta_pct >= 0 ? "+" : ""}${pl.delta_pct.toFixed(1)}%`
                                .length
                            }
                          />
                        ) : (
                          <AnimatedFigure
                            value={pl.delta_pct}
                            format={(n) =>
                              `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
                            }
                          />
                        )}
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
        {/* Available to spend (item 1): wallet cash on top with a good/bad dot.
            The dot + surplus/deficit come from the cash-flow projection, so they
            account for upcoming income through the last pay-day of the window
            (green when no shortfall in that window, red when it runs short). Below:
            spent-this-month + the projected surplus/deficit right before that last
            pay-day (end of current month when there's no income). */}
        <section
          data-testid="overview-card-available-to-spend"
          className={CARD}
        >
          <CardLabel>{t("cards.availableToSpend")}</CardLabel>
          <p className="num text-title-md mt-1 flex items-center gap-1.5 text-[var(--body-on-dark)]">
            {spendGood === true ? (
              <CircleCheck
                data-testid="spend-good"
                className="size-4 shrink-0 text-[var(--trading-up)]"
                aria-label={t("cards.spendGood")}
              />
            ) : spendGood === false ? (
              <CircleAlert
                data-testid="spend-bad"
                className="size-4 shrink-0 text-[var(--trading-down)]"
                aria-label={t("cards.spendBad")}
              />
            ) : (
              // No upcoming income (or projection not loaded) → neutral grey dot.
              <Circle
                data-testid="spend-neutral"
                className="size-4 shrink-0 text-[var(--muted-foreground)]"
                aria-label={t("cards.spendNeutral")}
              />
            )}
            <span className="truncate">
              {animRounded(data.spendings.wallet_cents)}
            </span>
          </p>
          <dl className="text-caption mt-1.5 flex flex-col gap-0.5 text-[var(--muted-foreground)]">
            <div className="flex items-center justify-between gap-2">
              <dt>{t("cards.spentThisMonth")}</dt>
              <dd className="num text-[var(--body-on-dark)]">
                {animRounded(data.spendings.spent_cents)}
              </dd>
            </div>
            {surplusDeficit !== null ? (
              <div className="flex items-center justify-between gap-2">
                <dt>{isDeficit ? t("cards.deficit") : t("cards.surplus")}</dt>
                {/* Inline color (tailwind-merge drops text-[var()] color): red
                    deficit (<0), white when exactly 0, green surplus (>0). */}
                <dd
                  data-testid="spend-surplus-deficit"
                  className="num"
                  style={{
                    color:
                      surplusDeficit < 0n
                        ? "var(--trading-down)"
                        : surplusDeficit === 0n
                          ? "var(--body-on-dark)"
                          : "var(--trading-up)",
                  }}
                >
                  {/* Whole units only — no cents (parity with the hero figures). */}
                  {animRounded(String(surplusDeficit))}
                </dd>
              </div>
            ) : (
              // No upcoming income → keep the original "upcoming" figure.
              <div className="flex items-center justify-between gap-2">
                <dt>{t("cards.leftToSpend")}</dt>
                <dd className="num text-[var(--body-on-dark)]">
                  {animRounded(data.spendings.left_cents)}
                </dd>
              </div>
            )}
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
              {t.rich(
                data.reserves.status === "surplus"
                  ? "cards.reservesSurplusNote"
                  : data.reserves.status === "short"
                    ? "cards.reservesShortNote"
                    : "cards.reservesOkNote",
                {
                  amount: fmtMoney(data.reserves.required_cents),
                  amt: (chunks) =>
                    hide ? (
                      <RedactionBar
                        chars={fmtMoney(data.reserves.required_cents).length}
                      />
                    ) : (
                      <>{chunks}</>
                    ),
                },
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
                {animMoney("0")}
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
                {(() => {
                  // No cushion requirement configured but cash IS saved → the runway
                  // is unbounded (money ÷ a zero monthly need), NOT "0d". Show ∞.
                  const unlimited =
                    data.cushion.required_cents === "0" &&
                    Number(data.cushion.total_cents) > 0;
                  if (hide)
                    return (
                      <RedactionBar
                        chars={
                          unlimited
                            ? 1
                            : formatRunway(
                                data.cushion.real_months,
                                runwayUnits,
                              ).length
                        }
                      />
                    );
                  if (unlimited)
                    return <span data-testid="cushion-unlimited">∞</span>;
                  return (
                    <AnimatedFigure
                      value={data.cushion.real_months}
                      format={(n) => formatRunway(n, runwayUnits)}
                    />
                  );
                })()}
              </span>
            </p>
            {/* Have vs needed to cover the threshold (item 5). */}
            <dl className="text-caption mt-1.5 flex flex-col gap-0.5 text-[var(--muted-foreground)]">
              <div className="flex items-center justify-between gap-2">
                <dt>{t("cards.cushionSaved")}</dt>
                <dd className="num text-[var(--body-on-dark)]">
                  {animRounded(data.cushion.total_cents)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>{t("cards.cushionNeeded")}</dt>
                <dd className="num text-[var(--body-on-dark)]">
                  {animRounded(data.cushion.required_cents)}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
