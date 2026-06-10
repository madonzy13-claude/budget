import { redirect } from "next/navigation";

/**
 * /onboarding — retired route.
 * Redirects to /budgets/new (the actual onboarding wizard since Phase 6).
 * Route kept so externally-linked /onboarding URLs still work.
 */
interface OnboardingRedirectProps {
  params: Promise<{ locale: string }>;
}

export default async function OnboardingRedirect({
  params,
}: OnboardingRedirectProps) {
  const { locale } = await params;
  redirect(`/${locale}/budgets/new`);
}
