/**
 * /[locale]/(app)/page.tsx — authenticated home (`/`) route.
 *
 * Fetches the user's accessible budgets via `/budgets/active` (RLS-scoped on
 * the API side), then either:
 *   - zero budgets → renders `HomeEmptyHero` with a CTA to /budgets/new.
 *   - one or more   → renders `HomeCardsGrid` (per-card Suspense streaming)
 *                     plus a `PlaceholderChart` below.
 *
 * 03-02 dual-emit fallback: read `body.budgets ?? body.workspaces ?? []` until
 * the legacy `workspaces` key is removed.
 */
import { getTranslations } from "next-intl/server";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { HomeCardsGrid } from "@/components/budgeting/home-cards-grid";

// The home page reads the per-user list of budgets. Without this Next.js
// statically pre-renders the page at build time (when there is no session)
// and bakes in the empty-hero HTML, which means the (app) layout's
// onboarding redirect never runs on real authenticated requests either.
export const dynamic = "force-dynamic";
import { HomeEmptyHero } from "@/components/budgeting/home-empty-hero";
import { PlaceholderChart } from "@/components/budgeting/placeholder-chart";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

async function fetchBudgets(): Promise<BudgetSummary[]> {
  const res = await serverApiFetch(null, "/budgets/active");
  if (!res.ok) return [];
  const body = (await res.json()) as {
    budgets?: BudgetSummary[];
    workspaces?: BudgetSummary[];
  };
  return body.budgets ?? body.workspaces ?? [];
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  const budgets = await fetchBudgets();

  if (budgets.length === 0) {
    return <HomeEmptyHero locale={locale} />;
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-12">
      <h1 className="text-title-lg text-[var(--body-on-dark)] mb-6">
        {t("heading")}
      </h1>
      <HomeCardsGrid budgets={budgets} locale={locale} />
      <div className="mt-8">
        <PlaceholderChart locale={locale} />
      </div>
    </main>
  );
}
