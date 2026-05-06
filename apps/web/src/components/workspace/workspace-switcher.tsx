"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api-client";

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
}

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[];
  initialActiveIds: string[];
  onActiveChange?: (activeIds: string[]) => void;
}

function WorkspaceSwitcherContent({
  workspaces,
  activeIds,
  onToggle,
}: {
  workspaces: WorkspaceSummary[];
  activeIds: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("workspaces.switcher");

  const privateWs = workspaces.filter((w) => w.kind === "PRIVATE");
  const sharedWs = workspaces.filter((w) => w.kind === "SHARED");

  const renderGroup = (group: WorkspaceSummary[], heading: string) => {
    if (group.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
        {group.map((ws) => (
          <label
            key={ws.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50"
          >
            <Checkbox
              checked={activeIds.includes(ws.id)}
              onCheckedChange={() => onToggle(ws.id)}
              aria-label={`Toggle ${ws.name}`}
            />
            <span className="flex-1 text-sm">{ws.name}</span>
            <Badge variant="outline" className="text-xs font-mono">
              {ws.default_currency}
            </Badge>
          </label>
        ))}
      </div>
    );
  };

  if (workspaces.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        {t("first_pick")}
      </p>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="px-3">
        <p className="text-sm font-semibold">{t("label")}</p>
        <p className="text-xs text-muted-foreground">{t("helper")}</p>
      </div>
      <Separator />
      {renderGroup(privateWs, t("group.private"))}
      {sharedWs.length > 0 && privateWs.length > 0 && <Separator />}
      {renderGroup(sharedWs, t("group.shared"))}
    </div>
  );
}

/**
 * WorkspaceSwitcher
 * - Mobile (<640px): renders inside a Sheet (slide-over from left)
 * - Tablet+ (≥640px): renders inline in the left rail
 * - Each toggle PUTs the new active_workspace_ids array immediately (D-07, TENT-12)
 * - Optimistic UI: revert + toast on error
 */
export function WorkspaceSwitcher({
  workspaces,
  initialActiveIds,
  onActiveChange,
}: WorkspaceSwitcherProps) {
  const t = useTranslations("workspaces.switcher");
  const [activeIds, setActiveIds] = useState<string[]>(initialActiveIds);
  const [mobileOpen, setMobileOpen] = useState(false);

  const persistActiveIds = useCallback(
    async (newIds: string[], previousIds: string[]) => {
      try {
        // PUT /api/settings/active-workspaces — persists active_workspace_ids (D-07)
        const res = await api.settings["active-workspaces"].$put({
          json: { active_workspace_ids: newIds },
        });
        if (!res.ok) {
          throw new Error("Failed to update active workspaces");
        }
        onActiveChange?.(newIds);
      } catch {
        // Revert optimistic update
        setActiveIds(previousIds);
        toast.error(
          t("error_save", { defaultValue: "Failed to save. Try again." }),
        );
      }
    },
    [onActiveChange, t],
  );

  const handleToggle = useCallback(
    (id: string) => {
      const previousIds = activeIds;
      const newIds = activeIds.includes(id)
        ? activeIds.filter((aid) => aid !== id)
        : [...activeIds, id];

      // Optimistic update
      setActiveIds(newIds);
      void persistActiveIds(newIds, previousIds);
    },
    [activeIds, persistActiveIds],
  );

  const activeCount = activeIds.length;

  return (
    <>
      {/* Mobile trigger button (<640px) */}
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-2 sm:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label={t("label")}
      >
        <LayoutGrid className="h-4 w-4" />
        <span>{t("active_count", { count: activeCount })}</span>
      </Button>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle>{t("label")}</SheetTitle>
          </SheetHeader>
          <WorkspaceSwitcherContent
            workspaces={workspaces}
            activeIds={activeIds}
            onToggle={handleToggle}
          />
        </SheetContent>
      </Sheet>

      {/* Inline rail (≥640px) — 240px wide sidebar */}
      <div className="hidden w-60 shrink-0 sm:block">
        <WorkspaceSwitcherContent
          workspaces={workspaces}
          activeIds={activeIds}
          onToggle={handleToggle}
        />
      </div>
    </>
  );
}
