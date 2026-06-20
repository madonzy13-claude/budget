/**
 * /budgets/[id]/settings — STATIC RSC shell (SPA refactor 260616).
 *
 * No server data fetch — budget meta is fetched client-side by SettingsTabClient
 * (useBudget) so the route stays a prefetchable static shell and returning to
 * Settings renders instantly from the warm React Query cache (no per-soft-nav
 * loading.tsx flash). The 5-section SettingsAccordion keeps its plain prop API.
 */
import { SettingsTabClient } from "@/components/settings/settings-tab-client";

// quick-260612-a0c R2: PillTaskSlider no longer renders here — the BDP layout
// renders the active pill's slider INSIDE the [data-bdp-tabs] sticky band so
// it can never slide under the pinned header (see ActivePillTaskSlider).

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function BdpSettingsPage({ params }: PageProps) {
  const { id: budgetId } = await params;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
      {/* h1 omitted — the BDP tab "Settings" is already the page title. */}
      <SettingsTabClient budgetId={budgetId} />
    </main>
  );
}
