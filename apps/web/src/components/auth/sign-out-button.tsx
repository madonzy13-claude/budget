"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { clearQueryCache, dropLegacyBudgetCache } from "@/lib/query-persist";

interface SignOutButtonProps {
  locale: string;
}

/**
 * Sign-out button — top-nav text link. Always rendered inside the (app)
 * layout, which is gated by middleware so we don't need a client-side
 * session check.
 */
export function SignOutButton({ locale }: SignOutButtonProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      // Tenant safety: clear per-browser caches before signing out — the
      // persisted React Query cache + the removed legacy offline-cache IDB.
      await Promise.allSettled([clearQueryCache(), dropLegacyBudgetCache()]);
      await signOut();
      router.push(`/${locale}/sign-in`);
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      disabled={isSigningOut}
      data-testid="sign-out-button"
      aria-label={t("sign_out")}
      className="text-[var(--muted-foreground)] hover:text-[var(--on-dark)]"
    >
      {isSigningOut ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
    </Button>
  );
}
