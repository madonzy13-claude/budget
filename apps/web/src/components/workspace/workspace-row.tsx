"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Archive, Briefcase, ArrowRight } from "lucide-react";
import { uuidv4 } from "@/lib/uuid";
import { clientApiFetch } from "@/lib/budget-fetch";

interface WorkspaceRowProps {
  workspaceId: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  defaultCurrency: string;
  locale: string;
}

export function WorkspaceRow({
  workspaceId,
  name,
  kind,
  defaultCurrency,
  locale,
}: WorkspaceRowProps) {
  const router = useRouter();
  const t = useTranslations("budgets");
  const [pending, setPending] = useState(false);

  async function archive() {
    if (pending) return;
    if (!confirm(`${t("list.manage")}: ${name}?`)) return;
    setPending(true);
    try {
      const res = await clientApiFetch(`/budgets/${workspaceId}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": uuidv4(),
        },
        body: "{}",
      });
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  const kindLabel = kind === "PRIVATE" ? t("kindPrivate") : t("kindShared");

  return (
    <div className="group flex items-center justify-between rounded-lg border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4 py-3.5 transition-all hover:border-[var(--primary)]/30 hover:bg-[var(--surface-elevated-dark)]">
      <Link
        href={`/${locale}/budgets/${workspaceId}/spendings`}
        className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]">
          <Briefcase className="h-4 w-4 text-[var(--primary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--on-dark)]">
            {name}
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {kindLabel} · {defaultCurrency}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>
      <div className="ml-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/${locale}/budgets/${workspaceId}/settings`}
          aria-label={`Edit ${name}`}
          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--primary)] cursor-pointer"
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <button
          type="button"
          aria-label={`Archive ${name}`}
          onClick={archive}
          disabled={pending}
          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--destructive)] cursor-pointer disabled:cursor-not-allowed"
        >
          <Archive className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
