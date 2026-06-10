/**
 * user-display-currency-reader.ts — Thin local port over the identity
 * UserRepo.findById path, exposing ONLY the field the budgeting bounded
 * context needs (`users.display_currency`).
 *
 * Why local: `packages/budgeting` does NOT depend on `@budget/identity`
 * (would cross-context-couple two bounded contexts). The apps/api boot layer
 * adapts `deps.identity.userRepo` into this port, preserving hex layering.
 *
 * The adapter for this port (in apps/api/src/boot.ts) calls
 * `deps.identity.userRepo.findById(UserId(userId))`, which internally uses
 * `withUserContext` (NOT `withTenantTx`) — identity is cross-tenant.
 */
export interface UserDisplayCurrencyReader {
  /**
   * Returns the user's display_currency (ISO-4217) or null when:
   *   - the user does not exist, OR
   *   - the user has no display_currency set.
   * The application service falls back to budget.default_currency in either case.
   */
  getDisplayCurrency(userId: string): Promise<string | null>;
}
