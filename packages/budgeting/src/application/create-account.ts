/**
 * create-account.ts — Backward-compat shim (Plan 01-02 rename to create-wallet.ts).
 * Route layer (Plan 01-03) will migrate imports to create-wallet directly.
 * @deprecated
 */
export { createWallet as createAccount } from "./create-wallet";
export type {
  CreateWalletDeps as CreateAccountDeps,
  CreateWalletFullInput as CreateAccountFullInput,
} from "./create-wallet";
