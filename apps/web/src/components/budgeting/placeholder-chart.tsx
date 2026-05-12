/**
 * placeholder-chart.tsx — HOME-04 placeholder chart card.
 *
 * Async RSC. CSS-only box with a BarChart3 lucide icon and "Insights coming
 * soon" copy. minHeight: 240px so the home page composes correctly under the
 * BudgetCard grid before Phase 8 ships the real chart.
 */
import { BarChart3 } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function PlaceholderChart({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "home" });
  return (
    <div
      className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border-y border-[var(--hairline-dark)] flex items-center justify-center gap-4 p-6"
      style={{ minHeight: "240px" }}
    >
      <BarChart3
        className="h-8 w-8 text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
      <p className="text-title-sm text-[var(--muted-foreground)]">
        {t("chart.placeholder")}
      </p>
    </div>
  );
}
