/**
 * list-accounts.ts — Backward-compat shim (Plan 01-02 rename to list-wallets.ts).
 * @deprecated
 */
export { listWallets as listAccounts } from "./list-wallets";
export type { ListWalletsDeps as ListAccountsDeps } from "./list-wallets";
