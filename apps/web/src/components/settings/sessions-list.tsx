"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";

export interface SessionInfo {
  id: string;
  deviceInfo?: string;
  lastActive: string;
  isCurrent: boolean;
}

interface SessionsListProps {
  sessions: SessionInfo[];
}

// i18n keys used: settings.sessions.revoke.confirm.title, settings.sessions.revoke.confirm.body, settings.sessions.revoke.confirm.cta
export function SessionsList({ sessions }: SessionsListProps) {
  const t = useTranslations("settings.sessions");
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
  const [activeSessions, setActiveSessions] = useState(sessions);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    try {
      await authClient.revokeSession({ token: revokeTarget.id });
      setActiveSessions((prev) => prev.filter((s) => s.id !== revokeTarget.id));
      toast.success("Session signed out.");
    } catch {
      toast.error("Failed to sign out session. Try again.");
    } finally {
      setRevokeTarget(null);
    }
  }, [revokeTarget]);

  if (activeSessions.length <= 1) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.device")}</TableHead>
            <TableHead>{t("col.last_active")}</TableHead>
            <TableHead>{t("col.status")}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeSessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell className="font-medium">
                {session.deviceInfo ?? "Unknown device"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {session.lastActive}
              </TableCell>
              <TableCell>
                {session.isCurrent && (
                  <Badge variant="secondary">{t("current_badge")}</Badge>
                )}
              </TableCell>
              <TableCell>
                {!session.isCurrent && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 min-h-[44px] min-w-[44px]"
                        aria-label={`Session options for ${session.deviceInfo ?? "this device"}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setRevokeTarget(session)}
                      >
                        {t("revoke.label")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* AlertDialog confirm — ESC does NOT dismiss (destructive action) */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revoke.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("revoke.confirm.body", {
                device: revokeTarget?.deviceInfo ?? "this device",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevoke}
            >
              {t("revoke.confirm.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
