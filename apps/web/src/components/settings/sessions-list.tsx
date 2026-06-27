"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Monitor, Smartphone } from "lucide-react";
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
import { authClient } from "@/lib/auth-client";
import { flagEmoji, lookupCountry } from "@/lib/ip-country";

export interface SessionInfo {
  id: string;
  /** Parsed from the User-Agent (UAT #5). */
  browser?: string;
  os?: string;
  /** Raw UA fallback when parsing yields nothing. */
  deviceInfo?: string;
  ipAddress?: string;
  /** Already formatted in the user's timezone (UAT #4/#5). */
  lastActive: string;
  isCurrent: boolean;
}

interface SessionsListProps {
  sessions: SessionInfo[];
}

// One confirm dialog backs both actions (single-revoke + sign-out-others).
type Confirm =
  | { kind: "revoke"; session: SessionInfo }
  | { kind: "others" }
  | null;

const MOBILE_OS = new Set(["iOS", "iPadOS", "Android"]);

function deviceLabel(
  s: SessionInfo,
  t: ReturnType<typeof useTranslations>,
): string {
  if (s.browser && s.os)
    return t("device_label", { browser: s.browser, os: s.os });
  if (s.browser) return s.browser;
  if (s.os) return s.os;
  if (s.deviceInfo) return s.deviceInfo;
  return t("unknown_device");
}

export function SessionsList({ sessions }: SessionsListProps) {
  const t = useTranslations("settings.sessions");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [activeSessions, setActiveSessions] = useState(sessions);
  // ip -> flag emoji, resolved best-effort (no flag if lookup fails).
  const [flags, setFlags] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const ips = [
      ...new Set(
        activeSessions
          .map((s) => s.ipAddress)
          .filter((ip): ip is string => !!ip),
      ),
    ];
    for (const ip of ips) {
      if (flags[ip] !== undefined) continue;
      void lookupCountry(ip).then((code) => {
        if (alive && code)
          setFlags((prev) => ({ ...prev, [ip]: flagEmoji(code) }));
      });
    }
    return () => {
      alive = false;
    };
  }, [activeSessions, flags]);

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

      <ul className="space-y-2">
        {activeSessions.map((session) => {
          const isMobile = session.os ? MOBILE_OS.has(session.os) : false;
          const DeviceIcon = isMobile ? Smartphone : Monitor;
          const flag = session.ipAddress ? flags[session.ipAddress] : "";
          return (
            <li
              key={session.id}
              data-testid={`session-row-${session.id}`}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <DeviceIcon
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-num-sm text-[var(--body-on-dark)]">
                      {deviceLabel(session, t)}
                    </span>
                    {session.isCurrent && (
                      <Badge variant="secondary">{t("current_badge")}</Badge>
                    )}
                  </div>
                  {session.ipAddress && (
                    <p className="flex items-center gap-1.5 text-caption text-[var(--muted-foreground)] tabular-nums">
                      {flag && <span aria-hidden="true">{flag}</span>}
                      <span className="truncate">{session.ipAddress}</span>
                    </p>
                  )}
                  <p className="text-caption text-[var(--muted-foreground)]">
                    {session.lastActive}
                  </p>
                </div>
              </div>
              {!session.isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-[var(--trading-down)] hover:text-[var(--trading-down)]"
                  data-testid={`session-revoke-${session.id}`}
                  onClick={() => setConfirm({ kind: "revoke", session })}
                >
                  {t("revoke.label")}
                </Button>
              )}
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
            <AlertDialogTitle>
              {confirm?.kind === "others"
                ? t("sign_out_others.confirm.title")
                : t("revoke.confirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "others"
                ? t("sign_out_others.confirm.body")
                : t("revoke.confirm.body", {
                    device:
                      confirm && confirm.kind === "revoke"
                        ? deviceLabel(confirm.session, t)
                        : "this device",
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
