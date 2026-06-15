"use client";
/**
 * NavCacheWarmer — proactively warms the SW caches (document + RSC) for every
 * route reachable from the current page while online, so an offline reload OR
 * client-side soft-nav serves the REAL cached page (260615-e8s rounds 4-5).
 *
 * Why aggressive: the SW only caches a route on a hard navigation it controls,
 * and Next's in-viewport prefetch is unreliable on iOS — so neither the budget
 * detail routes (home → budget) nor the BDP tabs were cached, and offline nav to
 * them failed. We collect home + the current path + every same-origin app link
 * on the page (home budget cards, BDP pills) and post them to the SW, which
 * fetches + caches BOTH the document (hard-nav/reload) and the RSC payload
 * (soft-nav). A session-scoped Set avoids re-warming. A delayed re-scan catches
 * links that stream in after first paint (the home BudgetCards are Suspense'd).
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SUPPORTED = ["en", "pl", "uk"];
const BDP_TABS = ["wallets", "spendings", "reserves", "settings"];
const BUDGET_TAB_RE =
  /^(\/(?:en|pl|uk)\/budgets\/[^/]+)\/(?:wallets|spendings|reserves|settings)$/;

function collectAppLinks(): string[] {
  const out = new Set<string>();
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((a) => {
    const href = (a.getAttribute("href") || "").split("?")[0].split("#")[0];
    if (SUPPORTED.includes(href.split("/")[1])) out.add(href);
  });
  // Derive the sibling BDP tabs from any budget link. The home budget cards link
  // only to /wallets, so without this the other tabs (spendings/reserves/
  // settings) are never warmed and an offline tab-switch falls to the shell.
  for (const u of [...out]) {
    const m = u.match(BUDGET_TAB_RE);
    if (m) BDP_TABS.forEach((t) => out.add(`${m[1]}/${t}`));
  }
  return [...out];
}

export function NavCacheWarmer({ locale }: { locale: string }) {
  const pathname = usePathname();
  const warmed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    function postFresh(candidates: string[]) {
      if (!navigator.onLine) return;
      const fresh = candidates
        .filter((u) => u && u.startsWith("/") && !warmed.current.has(u))
        .slice(0, 48);
      if (!fresh.length) return;
      fresh.forEach((u) => warmed.current.add(u));
      navigator.serviceWorker.ready
        .then((reg) => {
          const sw = navigator.serviceWorker.controller ?? reg.active;
          sw?.postMessage({ type: "WARM_ROUTES", urls: fresh });
        })
        .catch(() => {
          // SW not ready / unsupported — non-fatal.
        });
    }

    // Immediate: home + current path + links already in the DOM.
    postFresh([`/${locale}`, pathname, ...collectAppLinks()]);
    // Delayed: catch streamed-in links (home BudgetCards are Suspense'd).
    const t = setTimeout(() => postFresh(collectAppLinks()), 1500);
    return () => clearTimeout(t);
  }, [pathname, locale]);

  return null;
}
