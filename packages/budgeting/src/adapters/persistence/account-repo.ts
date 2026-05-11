/**
 * account-repo.ts — Backward-compat shim (Plan 01-02 rename to wallet-repo.ts).
 * Route layer (Plan 01-03) will migrate to DrizzleWalletRepo directly.
 * @deprecated
 */
export { DrizzleWalletRepo as DrizzleAccountRepo } from "./wallet-repo";
