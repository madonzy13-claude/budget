"use client";

/**
 * security-section.tsx — User-pill "Security" section (USET-05, Plan 10-04).
 *
 * Two controls, no backend change:
 *  1. Email-gated password change — `authClient.requestPasswordReset` fires a
 *     reset email to the account's OWN address (redirectTo the shared
 *     /reset-password page built by 10-05). The password is set only after the
 *     emailed token link, so a hijacked session can't change it (T-10-05). `email`
 *     is server-seeded as a prop (same path as ProfileSection — no client
 *     useSession, which is a nanostore atom here).
 *  2. Active sessions — fetched client-side via the callable `listSessions` /
 *     `getSession` methods (NOT the useSession atom), then handed to <SessionsList>
 *     for per-row revoke + "sign out all other devices".
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  SessionsList,
  type SessionInfo,
} from "@/components/settings/sessions-list";
import { authClient } from "@/lib/auth-client";
import { parseUserAgent } from "@/lib/parse-user-agent";
import { formatTimestamp } from "@/lib/format-date";

interface RawSession {
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  updatedAt?: string | Date;
  createdAt?: string | Date;
}

/** A session row with its raw timestamp kept around so it can be re-formatted
 *  when the user changes their timezone without a refetch. */
type RawRow = Omit<SessionInfo, "lastActive"> & { ts?: string | Date };

export function SecuritySection({ email }: { email: string }) {
  const t = useTranslations("settings.security");
  const locale = useLocale();
  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState<RawRow[] | null>(null);
  // The user's IANA zone (additionalField). Seeded from the session, then kept
  // live: changing it in the General section dispatches budget:timezone-changed
  // so these timestamps re-render in the new zone without a reload.
  const [tz, setTz] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [list, cur] = await Promise.all([
          authClient.listSessions(),
          authClient.getSession(),
        ]);
        const curData = (
          cur as {
            data?: {
              session?: { token?: string };
              user?: { timezone?: string };
            };
          }
        )?.data;
        const curToken = curData?.session?.token;
        const raw = ((list as { data?: RawSession[] })?.data ??
          []) as RawSession[];
        const mapped: RawRow[] = raw.map((s) => {
          const { browser, os } = parseUserAgent(s.userAgent);
          return {
            id: s.token,
            browser,
            os,
            deviceInfo: s.userAgent ?? undefined,
            ipAddress: s.ipAddress ?? undefined,
            ts: (s.updatedAt ?? s.createdAt) as string | Date | undefined,
            isCurrent: s.token === curToken,
          };
        });
        if (alive) {
          setRows(mapped);
          if (curData?.user?.timezone) setTz(curData.user.timezone);
        }
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Live timezone changes from the General section (same /settings page).
  useEffect(() => {
    function onTz(e: Event) {
      const next = (e as CustomEvent<string>).detail;
      if (next) setTz(next);
    }
    window.addEventListener("budget:timezone-changed", onTz);
    return () => window.removeEventListener("budget:timezone-changed", onTz);
  }, []);

  // Format each timestamp in the current zone (UAT #4/#5) — recomputed when the
  // zone changes so the list updates in place.
  const sessions = useMemo<SessionInfo[] | null>(
    () =>
      rows?.map((r) => ({
        ...r,
        lastActive: r.ts ? formatTimestamp(r.ts, locale, tz) : "",
      })) ?? null,
    [rows, tz, locale],
  );

  const onChangePassword = useCallback(async () => {
    setSending(true);
    try {
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: `/${locale}/reset-password`,
      });
      if ((res as { error?: unknown } | undefined)?.error) throw new Error();
      toast.success(t("change_password.sent"));
    } catch {
      toast.error(t("change_password.error"));
    } finally {
      setSending(false);
    }
  }, [email, locale, t]);

  return (
    <div className="space-y-8">
      {/* Password change */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--on-dark)]">
          {t("change_password.label")}
        </h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("change_password.description")}
        </p>
        <Button
          data-testid="change-password-button"
          onClick={onChangePassword}
          disabled={sending}
        >
          {t("change_password.label")}
        </Button>
      </section>

      {/* Active sessions */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-[var(--on-dark)]">
          {t("sessions_heading")}
        </h3>
        {sessions === null ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("sessions_loading")}
          </p>
        ) : (
          <SessionsList sessions={sessions} />
        )}
      </section>
    </div>
  );
}
