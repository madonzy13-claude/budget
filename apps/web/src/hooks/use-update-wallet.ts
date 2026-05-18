"use client";
/**
 * use-update-wallet.ts — Optimistic PATCH /wallets/:id mutation.
 *
 * T-05-02: Server validates cross-tenant (404 on foreign wallet).
 * T-05-03: Server returns 422 reserve_currency_mismatch; onError rolls back.
 * D-PH5-E1: Cross-invalidates ['budget', id, 'reserves'] when a RESERVE
 *            wallet is touched (current type OR new type === RESERVE).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { WalletDto } from "./use-wallets";

export interface UpdateWalletInput {
  walletId: string;
  name?: string;
  amount?: string; // numeric string (cents expressed as decimal, e.g. "10.50")
  currency?: string;
  walletType?: WalletDto["walletType"];
  // UAT-PH5-T3-1x: optional presentation customization. `null` clears the
  // value back to default (no color / no icon).
  color?: string | null;
  icon?: string | null;
}

/**
 * Returns true if this mutation touches a RESERVE wallet — either the wallet
 * is currently RESERVE or it is being changed TO RESERVE. Used to decide
 * whether to cross-invalidate the reserves query key.
 */
function touchesReserves(
  cachedWallets: WalletDto[] | undefined,
  input: UpdateWalletInput,
): boolean {
  const w = cachedWallets?.find((x) => x.id === input.walletId);
  if (!w) return false;
  if (w.walletType === "RESERVE") return true;
  if (input.walletType === "RESERVE") return true;
  return false;
}

export function useUpdateWallet(budgetId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateWalletInput) => {
      const { walletId, ...rest } = input;
      const res = await clientApiFetch(`/wallets/${walletId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body: JSON.stringify(rest),
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
      return (await res.json()).wallet as WalletDto;
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["budget", budgetId, "wallets"] });
      const previous = qc.getQueryData<WalletDto[]>([
        "budget",
        budgetId,
        "wallets",
      ]);

      qc.setQueryData<WalletDto[]>(["budget", budgetId, "wallets"], (old) => {
        if (!old) return old;
        return old.map((w) =>
          w.id === input.walletId
            ? {
                ...w,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.currency !== undefined
                  ? { currency: input.currency.toUpperCase() }
                  : {}),
                ...(input.amount !== undefined
                  ? {
                      currentBalanceCents: String(
                        Math.round(Number(input.amount) * 100),
                      ),
                    }
                  : {}),
                ...(input.walletType !== undefined
                  ? { walletType: input.walletType }
                  : {}),
                // UAT-PH5-T3-1x: presentation customization optimistic update.
                ...(input.color !== undefined ? { color: input.color } : {}),
                ...(input.icon !== undefined ? { icon: input.icon } : {}),
              }
            : w,
        );
      });

      return { previous };
    },

    onError: (err: Error & { code?: string | null }, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["budget", budgetId, "wallets"], ctx.previous);
      }
      // reserve_currency_mismatch: the component (wallets-sectioned-list) shows a
      // translated toast with budget currency context. Skip generic toast here.
      if (err?.code !== "reserve_currency_mismatch") {
        toast.error("bdp.tab.wallets.toast.saveFailed");
      }
    },

    onSettled: (_data, _err, input) => {
      // Read before invalidation so we can check the pre-invalidation type
      const current = qc.getQueryData<WalletDto[]>([
        "budget",
        budgetId,
        "wallets",
      ]);
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "wallets"] });
      if (touchesReserves(current, input)) {
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      }
    },
  });
}
