/**
 * step-welcome.tsx — Step 0: pre-wizard introduction.
 *
 * Shown once when the user first lands on the wizard. The (app) layout
 * onboarding guard sends incomplete users to /budgets/new with no step
 * param, which `WizardPage.initialStep` resolves to 0; after the user
 * clicks the layout's "Get started" button the wizard advances to
 * step 1 and the stepper takes over.
 */
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

export function StepWelcome() {
  const t = useTranslations("onboarding");
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--body-on-dark)]">
        {t("welcome_heading")}
      </h2>
      <p className="mx-auto max-w-prose text-sm text-[var(--muted-foreground)]">
        {t("welcome_body")}
      </p>
    </div>
  );
}
