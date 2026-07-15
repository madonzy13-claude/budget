// shared-kernel: exported domain primitives shared across all bounded contexts
export * from "./money";
export * from "./clock";
export * from "./server-clock";
export * from "./result";
export * from "./ids";
export * from "./env";
export * from "./ports";
export * from "./provider-guards";
// Phase 2: open currency type + helpers. Currency branded type exported as AnyCurrency
// to avoid name conflict with money.ts's Currency union type.
export {
  type Currency as AnyCurrency,
  asCurrency,
  isCrypto,
  isFiat,
} from "./currency";
