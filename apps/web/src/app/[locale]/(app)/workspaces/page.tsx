import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface WorkspacesPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Workspaces list page — Phase 1 skeleton.
 * Phase 2 will fetch real workspace data from apps/api via RSC.
 */
export default async function WorkspacesPage({ params }: WorkspacesPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workspaces" });

  // Phase 1: empty state — workspace data wired in Phase 2
  const workspaces: never[] = [];

  if (workspaces.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold leading-9">
              {t("empty.heading")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("empty.body")}</p>
          </div>
          {/* CTA enabled visually; clicking shows verify_required if unverified */}
          <Button asChild>
            <a href={`/${locale}/onboarding`}>{t("empty.cta")}</a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold leading-7">{t("list.heading")}</h1>
      </div>
      {/* Skeleton placeholder — replaced in Phase 2 */}
      <div className="mt-6 space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </main>
  );
}
