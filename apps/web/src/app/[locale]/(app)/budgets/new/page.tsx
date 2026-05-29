/**
 * /budgets/new — Onboarding wizard.
 *
 * RSC wrapper that renders the deferred-create client wizard.
 *
 * ─── RULE: Welcome popup gating ────────────────────────────────────────
 *
 * The "Let's create your first budget" intro card (wizard step 0) is
 * shown IF AND ONLY IF the signed-in user has zero budgets — that is,
 * the response from GET /budgets/active is an empty list.
 *
 * Concretely:
 *   * hasAnyBudget === false  → wizard opens on step 0 (welcome card,
 *                               "Get started" CTA).
 *   * hasAnyBudget === true   → wizard opens directly on step 1
 *                               (Basics), no welcome card.
 *
 * The route /budgets/new ITSELF stays reachable regardless of budget
 * count — existing users can always spawn another budget from here.
 * Only the welcome card is gated.
 *
 * ───────────────────────────────────────────────────────────────────────
 */
import { serverApiFetch } from "@/lib/budget-fetch.server";

interface NewBudgetPageProps {
  params: Promise<{ locale: string }>;
}

// /budgets/new branches on the caller's budget membership list and
// cannot be statically prerendered — force dynamic so the welcome-skip
// always reflects the real session.
export const dynamic = "force-dynamic";

export default async function NewBudgetPage({ params }: NewBudgetPageProps) {
  const { locale } = await params;

  // Check whether the caller already has any budget. If so, the wizard
  // skips the welcome screen and opens directly on step 1.
  let hasAnyBudget = false;
  try {
    const activeRes = await serverApiFetch(null, "/budgets/active");
    if (activeRes.ok) {
      const body = (await activeRes.json()) as {
        budgets?: unknown[];
        workspaces?: unknown[];
      };
      const list = body.budgets ?? body.workspaces ?? [];
      hasAnyBudget = list.length > 0;
    }
  } catch {
    // Best-effort: an api hiccup defaults to "no budget" → welcome
    // shown. Harmless for returning users (they just see an extra
    // intro screen on a click) and correct for first-timers.
  }

  // Lazy import keeps WizardPage (client) out of the server bundle.
  const { WizardPage } = await import("@/components/onboarding/wizard-page");

  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--canvas-dark)] px-4 py-12">
      <WizardPage locale={locale} skipWelcome={hasAnyBudget} />
    </main>
  );
}
