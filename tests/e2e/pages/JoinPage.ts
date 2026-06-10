/**
 * JoinPage.ts — Phase 6 share-link join page.
 *
 * The join page lives at /[locale]/budgets/join/[token] — OUTSIDE the (app)
 * route group. It is public (no auth bounce) and renders 6 possible states:
 * valid, expired, revoked, already_used, not_found, accepting.
 */
import { type Page, type Locator } from "@playwright/test";

export class JoinPage {
  constructor(private readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async open(locale: string, token: string): Promise<void> {
    await this.page.goto(`/${locale}/budgets/join/${token}`);
    await this.page.waitForLoadState("networkidle");
  }

  // ── Card states ─────────────────────────────────────────────────────────────

  /** The main card container. */
  card(): Locator {
    return this.page.getByTestId("join-page-card");
  }

  /** "Join budget" CTA shown when user is authenticated + invite is valid. */
  joinCta(): Locator {
    return this.page.getByRole("button", { name: /join budget/i });
  }

  /** "Sign in to accept" CTA shown when user is unauthenticated. */
  signInCta(): Locator {
    return this.page.getByRole("button", { name: /sign in to accept/i });
  }

  /** Error card heading (expired, revoked, not_found, already_used states). */
  errorHeading(): Locator {
    return this.page.getByTestId("join-error-heading");
  }

  /** Budget name shown on the valid invite card. */
  budgetNameText(): Locator {
    return this.page.getByTestId("join-budget-name");
  }

  /** "Return home" / "Go to budget" link on error states. */
  errorCta(): Locator {
    return this.page.getByTestId("join-error-cta");
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  toast(text: string | RegExp): Locator {
    return this.page.locator("[data-sonner-toast]", { hasText: text });
  }
}
