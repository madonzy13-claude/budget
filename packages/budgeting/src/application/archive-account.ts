/**
 * archive-account.ts — Backward-compat shim (Plan 01-02 rename to archive-wallet.ts).
 * @deprecated
 */
export { archiveWallet as archiveAccount } from "./archive-wallet";
export type { ArchiveWalletDeps as ArchiveAccountDeps } from "./archive-wallet";
