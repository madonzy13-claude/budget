import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface WorkspacesPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Workspaces list. Phase 1 ships an empty state that sells the next action;
 * Phase 2 wires real data from the API.
 *
 * Empty-state pattern (DESIGN.md): single yellow primary CTA + one-line body,
 * no illustration, no "welcome back" platitudes. The CTA is rendered as a
 * link so screen readers and Playwright `getByRole("link")` selectors keep
 * working unchanged.
 */
export default async function WorkspacesPage({ params }: WorkspacesPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workspaces" });

  const workspaces: never[] = [];

  if (workspaces.length === 0) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-start gap-10 px-4 py-16 sm:px-6">
        <p className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
          {t("empty.eyebrow", { defaultValue: "Get started" })}
        </p>
        <div className="space-y-3">
          <h1 className="text-display-md text-[var(--on-dark)]">
            {t("empty.heading")}
          </h1>
          <p className="max-w-prose text-base text-[var(--muted-foreground)]">
            {t("empty.body")}
          </p>
        </div>
        <Button asChild size="lg">
          <a href={`/${locale}/onboarding`}>{t("empty.cta")}</a>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title-lg text-[var(--on-dark)]">
          {t("list.heading")}
        </h1>
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </main>
  );
}
