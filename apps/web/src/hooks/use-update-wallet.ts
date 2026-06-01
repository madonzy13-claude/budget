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
import { useTranslations } from "next-intl";
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
  // UAT-PH5-T3-35: translate toast strings.
  const t = useTranslations("bdp.tab.wallets.toast");

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
      const body = (await res.json()) as {
        wallet: WalletDto;
        // UAT-PH5-T3-54: server returns the new reserves summary when amount
        // changes on a RESERVE wallet so the client can skip a refetch.
        summary?: unknown;
      };
      return body;
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
                  ? (() => {
                      // UAT-PH5-T3-29: guard the optimistic update against a
                      // non-numeric amount string (e.g. "123,45" if locale
                      // normalisation didn't run). Without this Number()
                      // returns NaN, which propagates to centsToBare → BigInt
                      // → SyntaxError mid-render. Skip the optimistic
                      // currentBalanceCents patch when the value is bad and
                      // let the server's 422 + rollback handle the recovery.
                      const n = Number(input.amount);
                      if (!Number.isFinite(n)) return {};
                      return {
                        currentBalanceCents: String(Math.round(n * 100)),
                      };
                    })()
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
        toast.error(t("saveFailed"));
      }
    },

    onSuccess: (data) => {
      // UAT-PH5-T3-54 perf: server returns the new reserves summary in
      // `summary` for RESERVE wallet amount edits. Snap the cache rather
      // than invalidating + refetching.
      if (data?.summary) {
        qc.setQueryData(["budget", budgetId, "reserves"], data.summary);
      }
    },

    onSettled: (data, _err, input) => {
      const current = qc.getQueryData<WalletDto[]>([
        "budget",
        budgetId,
        "wallets",
      ]);
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "wallets"] });
      // Only fall back to refetching reserves when the server didn't return
      // an authoritative summary (e.g. error path with a stale cache).
      if (!data?.summary && touchesReserves(current, input)) {
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      }
      // Tasks redesign: invalidate per-budget tasks query so badge/slider
      // refresh within ~1 tick instead of waiting for the 60s poll.
      // Backend set-wallet-balance fires recomputeReserveTopupTask +
      // recomputeCushionTask on every wallet amount/type change.
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
    },
  });
}
