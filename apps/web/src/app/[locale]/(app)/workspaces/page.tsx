import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkspaceRow } from "@/components/workspace/workspace-row";
import { serverApiFetch } from "@/lib/workspace-fetch.server";

interface WorkspacesPageProps {
  params: Promise<{ locale: string }>;
}

interface WorkspaceLite {
  id: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
}

async function fetchMyWorkspaces(): Promise<WorkspaceLite[]> {
  // /workspaces/active is auth-only (no header required) and returns memberships.
  const res = await serverApiFetch(null, "/workspaces/active");
  if (!res.ok) return [];
  const body = (await res.json()) as { workspaces?: WorkspaceLite[] };
  return body.workspaces ?? [];
}

export default async function WorkspacesPage({ params }: WorkspacesPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workspaces" });
  const workspaces = await fetchMyWorkspaces();

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
          <Link href={`/${locale}/onboarding`}>{t("empty.cta")}</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">
          {t("list.heading")}
        </h1>
        <Button
          asChild
          size="sm"
          className="bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color-mix(in_oklab,var(--primary)_85%,black)]"
        >
          <Link href={`/${locale}/onboarding`}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("list.addButton")}
          </Link>
        </Button>
      </div>
      <div className="space-y-2">
        {workspaces.map((w) => (
          <WorkspaceRow
            key={w.id}
            workspaceId={w.id}
            name={w.name}
            kind={w.kind}
            defaultCurrency={w.default_currency}
            locale={locale}
          />
        ))}
      </div>
    </main>
  );
}
