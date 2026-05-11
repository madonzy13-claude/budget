import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { serverApiFetch } from "@/lib/workspace-fetch.server";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; wsId: string }>;
}

interface WorkspaceLite {
  id: string;
  name: string;
  default_currency: string;
}

async function fetchWorkspace(wsId: string): Promise<WorkspaceLite | null> {
  const res = await serverApiFetch(null, "/workspaces/active");
  if (!res.ok) return null;
  const body = (await res.json()) as { workspaces?: WorkspaceLite[] };
  return body.workspaces?.find((w) => w.id === wsId) ?? null;
}

/**
 * Nested layout for /[locale]/workspaces/[wsId]/...
 * Verifies the caller is a member of wsId; otherwise redirects to /workspaces.
 * Renders a vertical sidebar (Budget · Accounts · Transactions · Recurring)
 * with active-tab highlighting + the workspace name + currency at the top.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const { locale, wsId } = await params;
  const ws = await fetchWorkspace(wsId);
  if (!ws) {
    redirect(`/${locale}/workspaces`);
  }
  const t = await getTranslations({ locale, namespace: "nav" });

  const tabs = [
    { key: "budget", href: `/${locale}/workspaces/${wsId}/budget`, label: t("budget") },
    { key: "accounts", href: `/${locale}/workspaces/${wsId}/accounts`, label: t("accounts") },
    { key: "transactions", href: `/${locale}/workspaces/${wsId}/transactions`, label: t("transactions") },
    { key: "recurring", href: `/${locale}/workspaces/${wsId}/recurring`, label: t("recurring") },
  ];

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6">
      <WorkspaceSidebar
        workspaceName={ws!.name}
        defaultCurrency={ws!.default_currency}
        tabs={tabs}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
