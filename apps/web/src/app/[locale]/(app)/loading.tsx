/**
 * loading.tsx — Home route skeleton (App Router Suspense fallback).
 *
 * Shown instantly on every navigation to "/" (home) while server RSC data
 * loads. Mirrors page.tsx layout exactly: the same <main> wrapper, the real
 * translated "My budgets" heading, then the 1/2/3-col grid rendered with
 * BudgetCardSkeleton primitives — so streaming the loaded page in causes no
 * layout shift.
 *
 * 260613-hig: added so navigation to home shows an instant skeleton instead
 * of freezing the old page for ~2s while listForUser executes.
 * 260613-jp6: render real heading + match page <main> wrapper to kill the
 * vertical jump when the "My budgets" title appeared after load.
 */
import { getTranslations } from "next-intl/server";
import { BudgetCardSkeleton } from "@/components/budgeting/budget-card-skeleton";

export default async function HomeLoading() {
  // No params in loading.tsx — next-intl resolves the active request locale
  // from the [locale] segment context, so the static "My budgets" heading
  // shows instantly and identically to page.tsx.
  const t = await getTranslations("home");

  // Wrapper mirrors page.tsx <main> so heading + grid sit at the same
  // x/y origin — no horizontal or vertical jump when the page streams in.
  return (
    <main className="pb-shell-safe mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-12">
      <h1 className="text-title-lg text-[var(--body-on-dark)] mb-6">
        {t("heading")}
      </h1>
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <BudgetCardSkeleton />
        <BudgetCardSkeleton />
        <BudgetCardSkeleton />
      </div>
    </main>
  );
}
