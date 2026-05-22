/**
 * /budgets/new — Onboarding wizard (D-05)
 *
 * RSC wrapper that renders the 5-step client wizard.
 * Phase 6 replaces the Phase 3 placeholder.
 */
interface NewBudgetPageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewBudgetPage({ params }: NewBudgetPageProps) {
  const { locale } = await params;
  // Lazy import so WizardPage (client) is not bundled server-side
  const { WizardPage } = await import("@/components/onboarding/wizard-page");

  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--canvas-dark)] px-4 py-12">
      <WizardPage locale={locale} />
    </main>
  );
}
