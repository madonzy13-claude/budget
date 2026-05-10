"use client";

/**
 * transaction-row-client.tsx — Client island for the "edited" badge + history panel.
 * Keeps TransactionList as RSC; only this small island is interactive.
 * Plan 02-07: click badge → EditHistoryPanel opens with transactionId.
 */
import { useState } from "react";
import { EditHistoryPanel } from "./edit-history-panel";

interface TransactionRowClientProps {
  transactionId: string;
  editedBadgeLabel: string;
}

export function TransactionRowClient({
  transactionId,
  editedBadgeLabel,
}: TransactionRowClientProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        data-testid={`edited-badge-${transactionId}`}
        className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--primary-muted)] text-[var(--primary)] hover:opacity-80 transition-opacity cursor-pointer"
        aria-label={`${editedBadgeLabel} — view edit history`}
      >
        {editedBadgeLabel}
      </button>

      <EditHistoryPanel
        transactionId={transactionId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
