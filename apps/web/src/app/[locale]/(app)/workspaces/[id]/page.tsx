import { getTranslations } from "next-intl/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkspaceDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function WorkspaceDetailPage({
  params,
}: WorkspaceDetailPageProps) {
  const { locale, id: workspaceId } = await params;
  const t = await getTranslations({ locale, namespace: "workspace" });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">{t("settings.members_tab")}</TabsTrigger>
          <TabsTrigger value="shares">{t("settings.shares_tab")}</TabsTrigger>
          <TabsTrigger value="settings">{t("settings.tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <p className="text-sm text-[var(--muted-foreground)]">
            Workspace {workspaceId} — members list (Phase 2)
          </p>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </TabsContent>

        <TabsContent value="shares">
          <p className="text-sm text-[var(--muted-foreground)]">
            Shares editor (Phase 2)
          </p>
        </TabsContent>

        <TabsContent value="settings">
          <p className="text-sm text-[var(--muted-foreground)]">
            Workspace settings (Phase 2)
          </p>
        </TabsContent>
      </Tabs>
    </main>
  );
}
