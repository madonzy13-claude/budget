/**
 * demo-banner.tsx — persistent "this is a demo" strip.
 *
 * Informational, not alarming, and deliberately NOT carrying the brand accent:
 * per DESIGN.md the single yellow is scarce and reserved for primary CTAs and
 * value-claim moments. A standing notice is neither.
 */
import { getTranslations } from "next-intl/server";

export async function DemoBanner({ isDemo }: { isDemo: boolean }) {
  if (!isDemo) return null;
  const t = await getTranslations("demo");

  return (
    <div
      data-testid="demo-banner"
      className="w-full border-b border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4 py-1.5 text-center text-xs text-[var(--text-secondary)]"
    >
      {t("banner")}
    </div>
  );
}
