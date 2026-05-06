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

export default async function OnboardingPage({ params }: OnboardingPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-start justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold leading-9">{t("heading")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("step_workspace")}</CardTitle>
            {/* PRIVATE is preselected in CreateWorkspaceForm (D-03) */}
            <CardDescription>
              {/* default_currency picker is required — cannot create without selecting */}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateWorkspaceForm
              locale={locale}
              onSuccess={(_workspaceId) => {
                // Navigation is handled inside the form component
              }}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
