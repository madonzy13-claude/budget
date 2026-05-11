/**
 * find-account-by-id.ts — Backward-compat shim (Plan 01-02 rename to find-wallet-by-id.ts).
 * @deprecated
 */
export { findWalletById as findAccountById } from "./find-wallet-by-id";
export type { FindWalletByIdDeps as FindAccountByIdDeps } from "./find-wallet-by-id";
