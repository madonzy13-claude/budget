/**
 * account.ts — Backward-compat shim (Plan 01-02 rename to wallet.ts).
 * @deprecated use Wallet from wallet.ts
 */
export { Wallet as Account } from "./wallet";
export type { WalletType as AccountKind } from "./wallet";
// AccountScope dropped in v1.1 (D-13); no equivalent exported.
