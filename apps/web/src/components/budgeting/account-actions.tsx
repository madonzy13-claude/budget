"use client";

/**
 * account-actions.tsx — Client island for account row icon-only actions.
 * RSC AccountsList stays a server component; only the archive button is interactive.
 * Plan 02-04 ACCT-02 (archive). Edit action is currently a stub (no editor surfaced yet).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive } from "lucide-react";
import { uuidv4 } from "@/lib/uuid";
import { clientApiFetch } from "@/lib/budget-fetch";

interface AccountActionsProps {
  accountId: string;
  accountName: string;
  editAriaLabel: string;
  archiveAriaLabel: string;
}

export function AccountActions({
  accountId,
  accountName: _accountName,
  editAriaLabel,
  archiveAriaLabel,
}: AccountActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  async function archive(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    try {
      const res = await clientApiFetch(`/wallets/${accountId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": uuidv4(),
        },
        body: "{}",
      });
      if (res.status === 401) {
        const locale = window.location.pathname.split("/")[1] || "en";
        window.location.assign(`/${locale}/sign-in?reason=session_expired`);
        return;
      }
      if (!res.ok) {
        console.error("[archive] failed", res.status, await res.text());
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="flex items-center gap-1"
      data-account-actions={accountId}
      data-hydrated={hydrated ? "true" : "false"}
    >
      <button
        type="button"
        aria-label={editAriaLabel}
        className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] hover:text-[var(--primary)] cursor-pointer"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={archiveAriaLabel}
        disabled={pending}
        onClick={archive}
        className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] hover:text-[var(--destructive)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
      >
        <Archive className="h-4 w-4" />
      </button>
    </div>
  );
}
