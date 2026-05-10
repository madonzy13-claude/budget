"use client";

/**
 * pending-drafts-inbox.tsx — list of PENDING recurring drafts.
 * Each row: due_date · description · 3 action buttons (Confirm / Edit & confirm / Skip).
 */
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface PendingDraft {
  id: string;
  ruleId: string;
  dueDate: string;
  amount: string;
  currency: string;
  kind: string;
  note: string | null;
}

export interface PendingDraftsInboxProps {
  drafts: PendingDraft[];
  onConfirm?: (id: string) => void;
  onEditConfirm?: (id: string) => void;
  onSkip?: (id: string) => void;
  /** For test override; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export function PendingDraftsInbox({
  drafts,
  onConfirm,
  onEditConfirm,
  onSkip,
  fetchImpl,
}: PendingDraftsInboxProps) {
  const t = useTranslations("budgeting.recurring");
  const doFetch = fetchImpl ?? fetch;

  async function callAction(
    draftId: string,
    action: "confirm" | "edit-confirm" | "skip",
  ) {
    const res = await doFetch(`/api/recurring-drafts/${draftId}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: action === "edit-confirm" ? JSON.stringify({ edits: {} }) : "",
    });
    if (!res.ok) {
      toast.error(`Failed: ${action}`);
    }
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-card-dark)] px-6 py-10 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("drafts.empty")}
        </p>
      </div>
    );
  }

  return (
    <ul
      className="divide-y divide-[var(--border)] rounded-xl bg-[var(--surface-card-dark)]"
      data-testid="pending-drafts-inbox"
    >
      {drafts.map((draft) => {
        const today = new Date().toISOString().slice(0, 10);
        const isOverdue = draft.dueDate < today;
        return (
          <li
            key={draft.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-0.5">
              <p
                className={
                  isOverdue
                    ? "text-sm font-medium text-[var(--trading-down,#f6465d)]"
                    : "text-sm font-medium"
                }
              >
                {draft.dueDate} · {draft.amount} {draft.currency}
              </p>
              {draft.note ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {draft.note}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  onConfirm?.(draft.id);
                  void callAction(draft.id, "confirm");
                }}
              >
                {t("drafts.confirmButton")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onEditConfirm?.(draft.id);
                  void callAction(draft.id, "edit-confirm");
                }}
              >
                {t("drafts.editConfirmButton")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onSkip?.(draft.id);
                  void callAction(draft.id, "skip");
                }}
              >
                {t("drafts.skipButton")}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
