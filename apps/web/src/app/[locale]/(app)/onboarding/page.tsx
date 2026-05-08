import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";

interface OnboardingPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Onboarding wizard step 1 — create the first workspace.
 *
 * Dark canvas hero band on top, dark surface-card-dark form card below.
 */
export default async function OnboardingPage({ params }: OnboardingPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <p className="text-caption uppercase tracking-wide text-[var(--primary)]">
          {t("eyebrow", { defaultValue: "Step 1 of 3" })}
        </p>
        <h1 className="text-display-sm text-[var(--on-dark)]">
          {t("heading")}
        </h1>
        <p className="max-w-prose text-base text-[var(--muted-foreground)]">
          {t("subtitle")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("step_workspace")}</CardTitle>
          <CardDescription>
            {t("step_workspace_helper", {
              defaultValue:
                "Pick a name, scope, and default currency. The currency is permanent.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}
