import type { Locale } from "@budget/identity";

/**
 * Hono context variable type augmentation.
 * Consumed by all middleware and route handlers.
 */
declare module "hono" {
  interface ContextVariableMap {
    session: { user: { id: string; email: string; locale: Locale } } | null;
    tenantIds: string[];
    locale: Locale;
  }
}
