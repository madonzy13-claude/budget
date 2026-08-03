"use client";
/**
 * planned-totals.tsx — the three figures the Planned section opens on (260803).
 *
 * Replaces the "Amount over budget, by category" bar: a per-category breakdown of
 * the overspend answered a question the charts below already answer, while the
 * plain question — what did the range cost, how much of it came out of the
 * reserve, how much was over — had no home.
 *
 * Laid out across, in the same caption-over-figure shape as the Overview's hero
 * cards. Reserve and overspend are PARTS of what was spent, so they only colour
 * when there is something to colour.
 */
import { useTranslations } from "next-intl";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";

export function PlannedTotals({
  spentCents,
  reserveUsedCents,
  overspentCents,
  format,
  maskValue = false,
  reservesEnabled = true,
}: {
  spentCents: string;
  reserveUsedCents: string;
  overspentCents: string;
  format: (cents: bigint) => string;
  maskValue?: boolean;
  /** Reserves off → the reserve figure would always read zero, so it is dropped. */
  reservesEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview");
  const metrics = [
    { key: "spent", label: t("planned.spent"), cents: spentCents, tone: "" },
    ...(reservesEnabled
      ? [
          {
            key: "reserve",
            label: t("planned.fromReserve"),
            cents: reserveUsedCents,
            tone: BigInt(reserveUsedCents || "0") > 0n ? "var(--primary)" : "",
          },
        ]
      : []),
    {
      key: "overspent",
      label: t("planned.overspent"),
      cents: overspentCents,
      tone: BigInt(overspentCents || "0") > 0n ? "var(--trading-down)" : "",
    },
  ];

  return (
    <div
      data-testid="planned-totals"
      className="flex flex-wrap items-start justify-center gap-6"
    >
      {metrics.map((m) => (
        <div key={m.key} className="flex flex-col gap-0.5 text-center">
          <p className="text-caption text-[var(--muted-foreground)]">
            {m.label}
          </p>
          <span
            className="num text-num-md"
            style={m.tone ? { color: m.tone } : undefined}
            data-testid={`planned-total-${m.key}`}
          >
            {maskValue ? (
              <SlotAmount value={format(BigInt(m.cents || "0"))} />
            ) : (
              format(BigInt(m.cents || "0"))
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
