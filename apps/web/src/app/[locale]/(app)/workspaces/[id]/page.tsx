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

  // Phase 1: skeleton tabs — populated in Phase 2+
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-32" />
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">{t("settings.members_tab")}</TabsTrigger>
          <TabsTrigger value="shares">{t("settings.shares_tab")}</TabsTrigger>
          <TabsTrigger value="settings">{t("settings.tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          {/* Phase 2: member list with invite + leave/transfer flows */}
          <p className="text-sm text-muted-foreground">
            Workspace {workspaceId} — members list (Phase 2)
          </p>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </TabsContent>

        <TabsContent value="shares" className="mt-6">
          {/* Phase 2: shares editor with live sum enforcement */}
          <p className="text-sm text-muted-foreground">
            Shares editor (Phase 2)
          </p>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <p className="text-sm text-muted-foreground">
            Workspace settings (Phase 2)
          </p>
        </TabsContent>
      </Tabs>
    </main>
  );
}
