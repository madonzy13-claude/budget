/**
 * /[locale]/(app)/page.tsx — authenticated home (`/`) route (SPA refactor 260616).
 *
 * Thin shell: renders the client-data HomeBudgetsClient, which fetches the
 * budget list (useActiveBudgets) + per-card summaries (useHomeSummary) and
 * renders the empty hero / cards / skeleton entirely client-side. Returning home
 * paints instantly from the warm React Query cache instead of re-streaming the
 * per-card server Suspense.
 *
 * 260619 (bug 2 — "BDP→listing loads from server, but it was cached"): this page
 * USED to `export const dynamic = "force-dynamic"`, which opts the route OUT of
 * the client Router Cache entirely → every return to home re-fetched `/en?_rsc`
 * from the server (~2s + skeleton flash) instead of reusing the cached shell.
 * Removed: the page does NO data fetch (its data is client-side React Query), and
 * the auth/onboarding gate lives in the force-dynamic (app) LAYOUT — which still
 * runs per-request on every navigation regardless of this page's caching. The
 * `await params` already makes the page request-dynamic (no build-time prerender
 * of no-session HTML), so dropping force-dynamic lets `staleTimes.dynamic=120`
 * reuse the home shell from the Router Cache — instant return, same as the tabs.
 */
import { HomeBudgetsClient } from "@/components/budgeting/home-budgets-client";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  // r35: the last-budget auto-open is a CLIENT soft-nav (HomeBudgetsClient) — a
  // server redirect here would hard-navigate the overview, and iOS resolves the
  // safe-area top inset 0→final on a hard load, dropping content down (a jump). A
  // soft-nav keeps the shell mounted so the inset never re-settles.
  return <HomeBudgetsClient locale={locale} />;
}
