"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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

// One confirm dialog backs both actions (single-revoke + sign-out-others) — they
// share copy shape and the same row-pruning success path.
type Confirm =
  | { kind: "revoke"; session: SessionInfo }
  | { kind: "others" }
  | null;

export function SessionsList({ sessions }: SessionsListProps) {
  const t = useTranslations("settings.sessions");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [activeSessions, setActiveSessions] = useState(sessions);

  const onConfirm = useCallback(async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === "revoke") {
        await authClient.revokeSession({ token: confirm.session.id });
        setActiveSessions((prev) =>
          prev.filter((s) => s.id !== confirm.session.id),
        );
        toast.success(t("success_revoke"));
      } else {
        await authClient.revokeOtherSessions();
        setActiveSessions((prev) => prev.filter((s) => s.isCurrent));
        toast.success(t("success_revoke_others"));
      }
    } catch {
      toast.error(
        confirm.kind === "revoke"
          ? t("error_revoke")
          : t("error_revoke_others"),
      );
    } finally {
      setConfirm(null);
    }
  }, [confirm, t]);

  if (activeSessions.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">{t("empty")}</p>
    );
  }

  const hasOthers = activeSessions.some((s) => !s.isCurrent);

  return (
    <div className="space-y-4">
      {hasOthers && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            data-testid="sign-out-others"
            onClick={() => setConfirm({ kind: "others" })}
          >
            {t("sign_out_others.label")}
          </Button>
        </div>
      )}

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
            <TableRow
              key={session.id}
              data-testid={`session-row-${session.id}`}
            >
              <TableCell className="font-medium text-[var(--foreground)]">
                {session.deviceInfo ?? t("unknown_device")}
              </TableCell>
              <TableCell className="text-[var(--muted-foreground)]">
                {session.lastActive}
              </TableCell>
              <TableCell>
                {session.isCurrent && (
                  <Badge variant="secondary">{t("current_badge")}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--trading-down)] hover:text-[var(--trading-down)]"
                    data-testid={`session-revoke-${session.id}`}
                    onClick={() => setConfirm({ kind: "revoke", session })}
                  >
                    {t("revoke.label")}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "others"
                ? t("sign_out_others.confirm.title")
                : t("revoke.confirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "others"
                ? t("sign_out_others.confirm.body")
                : t("revoke.confirm.body", {
                    device: confirm?.session.deviceInfo ?? "this device",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("revoke.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-action"
              className="bg-[var(--trading-down)] text-[var(--on-dark)] hover:bg-[color-mix(in_oklab,var(--trading-down)_85%,black)]"
              onClick={onConfirm}
            >
              {confirm?.kind === "others"
                ? t("sign_out_others.confirm.cta")
                : t("revoke.confirm.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
