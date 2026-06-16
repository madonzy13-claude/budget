/**
 * /[locale]/(app)/page.tsx — authenticated home (`/`) route (SPA refactor 260616).
 *
 * Thin shell: renders the client-data HomeBudgetsClient, which fetches the
 * budget list (useActiveBudgets) + per-card summaries (useHomeSummary) and
 * renders the empty hero / cards / skeleton entirely client-side. Returning home
 * paints instantly from the warm React Query cache instead of re-streaming the
 * per-card server Suspense.
 *
 * `force-dynamic` is kept so the route renders per-request and the (app) layout's
 * auth/onboarding redirect always runs (the page itself no longer fetches data).
 */
import { HomeBudgetsClient } from "@/components/budgeting/home-budgets-client";

export const dynamic = "force-dynamic";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  return <HomeBudgetsClient locale={locale} />;
}
