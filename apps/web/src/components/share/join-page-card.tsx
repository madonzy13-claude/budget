"use client";

/**
 * join-page-card.tsx — Public share-link recipient join confirmation card.
 *
 * Handles all 6 states:
 *   valid+auth, valid+unauth, expired, already_used, not_found, accepting
 *
 * Layout: full-viewport centered, max-w-[400px], no nav chrome.
 * Color contract: only Join CTA / sign-in link gets yellow (--primary).
 * SHRD-04
 */
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type JoinPageState = "valid" | "expired" | "already_used" | "not_found";

export interface JoinPageCardProps {
  state: JoinPageState;
  budgetName?: string;
  token?: string;
  isAuthenticated?: boolean;
  /** Pre-set to true to show the accepting/loading state */
  accepting?: boolean;
}

export function JoinPageCard({
  state,
  budgetName,
  token,
  isAuthenticated = false,
  accepting: initialAccepting = false,
}: JoinPageCardProps) {
  const t = useTranslations("share");
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";

  const [accepting, setAccepting] = useState(initialAccepting);
  const [cardState, setCardState] = useState<JoinPageState>(state);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/budgets/join/${token}/accept`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const { budgetId } = (await res.json()) as { budgetId: string };
        toast.success(t("join_success", { budgetName: budgetName ?? "" }));
        router.push(`/${locale}/budgets/${budgetId}/spendings`);
        return;
      }

      if (res.status === 410) {
        setCardState("expired");
      } else if (res.status === 409) {
        setCardState("already_used");
      }
    } catch {
      // network error — leave accepting=false so user can retry
    }
    setAccepting(false);
  }

  function handleSignIn() {
    const returnUrl = encodeURIComponent(
      typeof window !== "undefined" ? window.location.pathname : "",
    );
    router.push(`/${locale}/sign-in?returnUrl=${returnUrl}`);
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (cardState === "not_found") {
    return (
      <Card className="w-full max-w-[400px]">
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold text-[var(--body)]">
              {t("not_found_heading")}
            </h2>
          </CardTitle>
          <CardDescription>{t("not_found_body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${locale}`}
            className="text-sm font-medium text-[var(--body)] underline underline-offset-4 hover:text-[var(--muted)]"
          >
            {t("not_found_cta")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Expired / Revoked ──────────────────────────────────────────────────────
  if (cardState === "expired") {
    return (
      <Card className="w-full max-w-[400px]">
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold text-[var(--body)]">
              {t("expired_heading")}
            </h2>
          </CardTitle>
          <CardDescription>{t("expired_body")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── Already used ──────────────────────────────────────────────────────────
  if (cardState === "already_used") {
    return (
      <Card className="w-full max-w-[400px]">
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold text-[var(--body)]">
              {t("already_used_heading")}
            </h2>
          </CardTitle>
          <CardDescription>
            {t("already_used_body", { budgetName: budgetName ?? "" })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${locale}`}
            className="text-sm font-medium text-[var(--body)] underline underline-offset-4 hover:text-[var(--muted)]"
          >
            {t("already_used_cta")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Valid ─────────────────────────────────────────────────────────────────
  return (
    <Card className="w-full max-w-[400px]">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold text-[var(--body)]">
            {t("valid_heading")}
          </h2>
        </CardTitle>
        {budgetName && (
          <p className="text-base font-semibold text-[var(--body)]">
            {budgetName}
          </p>
        )}
        <CardDescription>{t("valid_body")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAuthenticated ? (
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? t("accepting_cta") : t("authenticated_cta")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="w-full text-[var(--primary)] hover:text-[var(--primary-active)]"
            onClick={handleSignIn}
          >
            {t("unauthenticated_cta")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
