/* @budget/budgeting — Budgeting bounded context. Phase 2. */
// Re-exports populated by later plans

// Domain entities
export type { WalletType } from "./domain/wallet";
export { Wallet } from "./domain/wallet";

// Port types
export type { WalletRepo } from "./ports/wallet-repo";

// Application use cases
export { createWallet } from "./application/create-wallet";
export { archiveWallet } from "./application/archive-wallet";
export { listWallets } from "./application/list-wallets";
export { findWalletById } from "./application/find-wallet-by-id";
export { setWalletBalance } from "./application/set-wallet-balance";

// Contract types
export type {
  CreateWalletInput,
  WalletDto,
  CreateCategoryInput,
  CategoryDto,
} from "./contracts/api";
