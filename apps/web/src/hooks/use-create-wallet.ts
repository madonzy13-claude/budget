"use client";
/**
 * use-create-wallet.ts — POST /wallets mutation for the staged-add flow.
 *
 * D-PH5-W9: Called ONLY on Name blur with non-empty trimmed value.
 *            The staged-add UI component owns the draft-row DOM lifecycle.
 * T-05-14: No optimistic cache insert — POST fires only after Name blur,
 *           not on +Add click. Zero requests for empty drafts.
 * D-PH5-E1: Cross-invalidates reserves when a RESERVE wallet is created.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { WalletDto } from "./use-wallets";

export interface CreateWalletInput {
  name: string;
  currency: string;
  amount: string; // "0" for new wallets
  walletType: WalletDto["walletType"];
}

export function useCreateWallet(budgetId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWalletInput) => {
      const res = await clientApiFetch(`/wallets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.text();
        const err: Error & { code?: string | null } = new Error(body);
        try {
          err.code = (JSON.parse(body) as { error?: string })?.error ?? null;
        } catch {
          err.code = null;
        }
        throw err;
      }
      const json = await res.json();
      return (json.wallet ?? json) as WalletDto;
    },

    onError: () => toast.error("bdp.tab.wallets.toast.createFailed"),
    onSuccess: () => toast.success("bdp.tab.wallets.toast.created"),

    onSettled: (data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "wallets"] });
      if (input.walletType === "RESERVE" || data?.walletType === "RESERVE") {
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      }
    },
  });
}
