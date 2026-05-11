/**
 * v11-key-rename.test.ts — Vitest unit tests verifying i18n JSON key renames for v1.1.
 *
 * Asserts:
 * - top-level `workspaces` → `budgets`
 * - top-level `workspace` → `budget`
 * - `nav.workspaces` → `nav.budgets`
 * - `nav.accounts` → `nav.wallets`
 * - `budgeting.accounts` → `budgeting.wallets`
 * - no `scopeLabel` in wallet form (D-13)
 *
 * All three locales (en, pl, uk) must satisfy the same structural assertions.
 */
import { describe, test, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const LOCALES = { en, pl, uk } as const;

type Locale = typeof en;

describe("i18n v1.1 key rename", () => {
  for (const [locale, msg] of Object.entries(LOCALES) as [string, Locale][]) {
    describe(`${locale}.json`, () => {
      test("has top-level 'budgets' key, not 'workspaces'", () => {
        expect(Object.keys(msg)).toContain("budgets");
        expect(Object.keys(msg)).not.toContain("workspaces");
      });

      test("has top-level 'budget' key (singular), not 'workspace'", () => {
        expect(Object.keys(msg)).toContain("budget");
        expect(Object.keys(msg)).not.toContain("workspace");
      });

      test("has 'nav.budgets' key, not 'nav.workspaces'", () => {
        const nav = msg.nav as Record<string, unknown>;
        expect(Object.keys(nav)).toContain("budgets");
        expect(Object.keys(nav)).not.toContain("workspaces");
      });

      test("has 'nav.wallets' key, not 'nav.accounts'", () => {
        const nav = msg.nav as Record<string, unknown>;
        expect(Object.keys(nav)).toContain("wallets");
        expect(Object.keys(nav)).not.toContain("accounts");
      });

      test("has 'budgeting.wallets' subtree, not 'budgeting.accounts'", () => {
        const budgeting = msg.budgeting as Record<string, unknown>;
        expect(Object.keys(budgeting)).toContain("wallets");
        expect(Object.keys(budgeting)).not.toContain("accounts");
      });

      test("budgeting.wallets.form does not contain scopeLabel (D-13)", () => {
        const budgeting = msg.budgeting as Record<string, unknown>;
        const wallets = budgeting.wallets as Record<string, unknown>;
        const form = wallets?.form as Record<string, unknown> | undefined;
        if (form) {
          expect(Object.keys(form)).not.toContain("scopeLabel");
        }
      });
    });
  }
});
