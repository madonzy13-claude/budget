/**
 * adjust-account-balance.ts — Backward-compat shim (Plan 01-02 rename to adjust-wallet-balance.ts).
 * @deprecated
 */
export { adjustWalletBalance as adjustAccountBalance } from "./adjust-wallet-balance";
export type {
  AdjustWalletBalanceDeps as AdjustAccountBalanceDeps,
  AdjustWalletBalanceFullInput as AdjustAccountBalanceFullInput,
} from "./adjust-wallet-balance";
