"use client";
/**
 * aggregate-composition.tsx — wealth-composition pie for the aggregate
 * overview (Task 14). Three slices (cash / investments / reserves) summed
 * over the same `included` rows as the rest of aggregate-overview.tsx, so
 * exclude toggles move this pie too. Zero-value slices are dropped; the
 * whole section hides when every slice is zero.
 */
import { useTranslations } from "next-intl";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import { centsToRounded } from "@/lib/cents-format";

const COLOR: Record<string, string> = {
  cash: "var(--trading-up)",
  investments: "var(--primary)",
  reserves: "var(--muted-foreground)",
};

export function AggregateComposition({
  cashCents,
  investmentsCents,
  reservesCents,
  currency,
  locale,
}: {
  cashCents: string;
  investmentsCents: string;
  reservesCents: string;
  currency: string;
  locale: string;
}) {
  const t = useTranslations("aggregate");
  const data = [
    { name: "cash", label: t("cash"), value: Number(cashCents) },
    {
      name: "investments",
      label: t("investments"),
      value: Number(investmentsCents),
    },
    { name: "reserves", label: t("reserves"), value: Number(reservesCents) },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  return (
    <section
      data-testid="aggregate-composition"
      className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4"
    >
      <p className="text-sm font-semibold text-[var(--body)]">
        {t("composition_title")}
      </p>
      <OverviewPieChart
        data={data}
        nameKey="name"
        valueKey="value"
        colorFor={(name: string) => COLOR[name] ?? "var(--muted-foreground)"}
        formatValue={(v: number) =>
          centsToRounded(BigInt(Math.round(v)), currency, locale, true)
        }
        formatName={(name: string) =>
          data.find((d) => d.name === name)?.label ?? name
        }
        height={220}
      />
    </section>
  );
}
