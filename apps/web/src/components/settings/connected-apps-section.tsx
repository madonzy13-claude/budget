"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite } from "@/lib/offline-write";

/**
 * Settings → Connected apps (Phase 15, D-21): the AI assistants this user
 * connected over MCP, with Disconnect. Per user, never per budget. Nothing
 * about what an agent did is shown here — by design (D-07).
 */
interface Connection {
  client_id: string;
  client_name: string | null;
  scopes: string[];
  connected_at: string;
  last_used_at: string | null;
}

const KEY = ["connected-apps"] as const;

export function ConnectedAppsSection() {
  const t = useTranslations("settings.connectedApps");
  const locale = useLocale();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<Connection | null>(null);

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const r = await clientApiFetch("/settings/connected-apps");
      if (!r.ok) throw new Error("connected_apps_failed");
      return ((await r.json()) as { connections: Connection[] }).connections;
    },
  });

  const fmt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  });

  async function onDisconnect() {
    if (!confirm) return;
    const id = confirm.client_id;
    try {
      const r = await clientApiWrite(
        `/settings/connected-apps/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error("disconnect_failed");
      qc.setQueryData<Connection[]>(KEY, (prev) =>
        (prev ?? []).filter((c) => c.client_id !== id),
      );
      toast.success(t("disconnected"));
    } catch {
      toast.error(t("error"));
    } finally {
      setConfirm(null);
    }
  }

  if (!data) return null;

  if (data.length === 0)
    return (
      <div className="space-y-1">
        <p className="text-sm text-[var(--body-on-dark)]">{t("empty")}</p>
        <p className="text-caption text-[var(--muted-foreground)]">
          {t("emptyHint", {
            url: `${typeof window === "undefined" ? "" : window.location.origin}/mcp`,
          })}
        </p>
      </div>
    );

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {data.map((c) => {
          const name = c.client_name ?? c.client_id;
          return (
            <li
              key={c.client_id}
              data-testid={`connected-app-${c.client_id}`}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Plug
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-num-sm text-[var(--body-on-dark)]">
                    {name}
                  </p>
                  <p className="text-caption text-[var(--muted-foreground)]">
                    {t("connectedOn", { date: fmt.format(new Date(c.connected_at)) })}
                  </p>
                  <p className="text-caption text-[var(--muted-foreground)]">
                    {c.last_used_at
                      ? t("lastUsed", { date: fmt.format(new Date(c.last_used_at)) })
                      : t("neverUsed")}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                style={{ color: "var(--trading-down)" }}
                data-testid={`disconnect-${c.client_id}`}
                onClick={() => setConfirm(c)}
              >
                {t("disconnect")}
              </Button>
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmBody", {
                client: confirm?.client_name ?? confirm?.client_id ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-action"
              style={{
                background: "var(--trading-down)",
                color: "var(--on-dark)",
              }}
              onClick={onDisconnect}
            >
              {t("confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
