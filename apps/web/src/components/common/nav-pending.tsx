"use client";
/**
 * nav-pending.tsx — Client-side navigation transition affordance.
 *
 * Goal: when the user clicks a chrome link, the browser feels instantly
 * responsive — the destination URL "wins" immediately, and the current
 * page content blurs as a placeholder until the new RSC tree commits.
 * This removes the dead-zone where the old page sat untouched while the
 * server prepared the next route (especially noticeable with our
 * `force-dynamic` `(app)` layout, where every navigation hits the API).
 *
 * The pattern is intentionally pathname-driven, not `useTransition`-driven:
 *   - `startNav(href)` records the requested destination.
 *   - The provider watches `usePathname()` and clears the target as soon
 *     as the URL commits to (a prefix of) the requested href — that's the
 *     moment React paints the new tree.
 *   - A 6s safety timer clears the target if a navigation aborts (e.g.
 *     the API never responds) so the UI never stays stuck behind blur.
 *
 * Counts of in-flight links don't matter — only "is there *any* pending
 * destination" — because multiple chrome links resolve to the same
 * pathname transition (e.g. the user clicks Wallets twice).
 */
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavPendingContextValue {
  /** True while a chrome link click is awaiting the new RSC tree. */
  pending: boolean;
  /** Mark a navigation as in-flight. Pass the destination href. */
  startNav: (href: string) => void;
}

const NavPendingContext = React.createContext<NavPendingContextValue | null>(
  null,
);

/**
 * Strip the locale prefix and query string so we compare apples to
 * apples. `usePathname()` returns the leading `/en` (or `/pl`, `/uk`)
 * but chrome links also include the locale, so we just normalise both
 * sides to "/budgets/abc/wallets" before comparing.
 *
 * Query strings are dropped because the App Router fires a navigation
 * commit on the pathname swap; query-only changes don't unmount the
 * page tree and shouldn't trigger the blur overlay.
 */
function normalise(href: string): string {
  const noQuery = href.split("?")[0] ?? href;
  const m = noQuery.match(/^\/(?:en|pl|uk)(\/.*)?$/);
  return m ? (m[1] ?? "/") : noQuery;
}

export function NavPendingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [target, setTarget] = React.useState<string | null>(null);

  // Latch the target as soon as the current pathname matches it — that's
  // the React commit for the requested route, i.e. the new tree is on
  // screen. The match is prefix-based so query-only differences and
  // section anchors still resolve.
  React.useEffect(() => {
    if (!target) return;
    if (normalise(pathname) === normalise(target)) {
      setTarget(null);
    }
  }, [pathname, target]);

  // Safety net: a 6s timeout clears the pending state if the navigation
  // never commits (network stall, API hang). Without it the UI could
  // stay perma-blurred and the user would think the app is dead.
  React.useEffect(() => {
    if (!target) return;
    const id = window.setTimeout(() => setTarget(null), 6000);
    return () => window.clearTimeout(id);
  }, [target]);

  const startNav = React.useCallback(
    (href: string) => {
      // Same-route click is a no-op for the overlay — no blur needed when
      // the user clicks the active link.
      if (normalise(href) === normalise(pathname)) return;
      setTarget(href);
    },
    [pathname],
  );

  const value = React.useMemo(
    () => ({ pending: target !== null, startNav }),
    [target, startNav],
  );

  return (
    <NavPendingContext.Provider value={value}>
      {children}
    </NavPendingContext.Provider>
  );
}

/**
 * Read the current pending state from anywhere under the provider.
 * Returns a noop `startNav` when used outside the provider so tests +
 * Storybook can render chrome links without wiring the full context.
 */
export function useNavPending(): NavPendingContextValue {
  const ctx = React.useContext(NavPendingContext);
  if (!ctx) {
    return { pending: false, startNav: () => {} };
  }
  return ctx;
}

/**
 * Drop-in replacement for `useRouter()` that wires `push` / `replace`
 * through the nav-pending overlay. Use this anywhere chrome code calls
 * `router.push(href)` from an event handler (e.g. budget switcher row
 * click, locale select, danger-zone leave/delete redirects). External
 * URLs and `back()` / `forward()` skip the overlay — only same-app
 * URL strings should trigger the blur.
 */
export function useNavRouter() {
  const router = useRouter();
  const { startNav } = useNavPending();

  const push = React.useCallback(
    (href: string, options?: Parameters<typeof router.push>[1]) => {
      startNav(href);
      router.push(href, options);
    },
    [router, startNav],
  );

  const replace = React.useCallback(
    (href: string, options?: Parameters<typeof router.replace>[1]) => {
      startNav(href);
      router.replace(href, options);
    },
    [router, startNav],
  );

  // Bind defensively — unit tests stub next/navigation's `useRouter`
  // with `{ push }` only, so `router.back` etc. are undefined. Guarding
  // keeps the hook usable in those test harnesses without forcing every
  // test to expand its mock.
  const noop = React.useCallback(() => {}, []);
  return React.useMemo(
    () => ({
      push,
      replace,
      back: router.back ? router.back.bind(router) : noop,
      forward: router.forward ? router.forward.bind(router) : noop,
      refresh: router.refresh ? router.refresh.bind(router) : noop,
      prefetch: router.prefetch ? router.prefetch.bind(router) : noop,
    }),
    [push, replace, router, noop],
  );
}

/**
 * Visual overlay wrapping the route children. When a nav is pending we:
 *   - blur the content (`blur-[2px]`) so it reads as "old, refreshing"
 *   - drop opacity slightly (`opacity-70`) for additional contrast
 *   - disable pointer events so a fast double-click doesn't mis-trigger
 *     stale UI on the outgoing page
 *
 * Always animated — even the un-blur — so the swap feels intentional.
 * Tailwind v4's `transition-[filter]` covers the blur interpolation;
 * we pair it with `transition-opacity` so both properties ease together.
 */
export function NavPendingOverlay({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useNavPending();
  const pathname = usePathname();
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Reset the closest scrollable ancestor's scrollTop on every route
  // commit. The (app) layout shares a single `<main overflow-y-auto>`
  // across all BDP tabs, so without this the scroll position of the
  // outgoing route (e.g. Spendings at 800px) leaks into the incoming
  // one (e.g. Wallets opens scrolled 800px down, sometimes past the
  // entire content). Browsers' built-in scroll restoration only fires
  // for full document navigations, not in-app App Router transitions.
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // Walk up to find the nearest scrollable ancestor — that's the
    // `<main>` wrapper in (app)/layout.tsx in practice. We don't
    // hard-code the selector so the reset stays robust if the layout
    // shape changes.
    let node: HTMLElement | null = el;
    while (node) {
      const overflow = window.getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        node.scrollTo({
          top: 0,
          left: 0,
          behavior: "instant" as ScrollBehavior,
        });
        break;
      }
      node = node.parentElement;
    }
  }, [pathname]);

  return (
    <div
      ref={rootRef}
      data-nav-pending={pending ? "true" : "false"}
      aria-busy={pending}
      className={cn(
        // `flex flex-col min-h-0` lets descendant pages opt into a
        // flex-grow chain — useful for layouts whose inner scroll
        // container needs to claim the exact remaining height after
        // sticky elements (e.g. the wallets list under the BDP tabs).
        "flex flex-col min-h-0",
        // UAT round 18: dropped `will-change-[filter,opacity]`. The
        // hint promotes the element to its own composite layer AND
        // creates a containing block for `position: fixed` descendants
        // (per spec, browsers treat `will-change: filter` as if the
        // filter were active). That offset the wallets DragOverlay
        // ghost from the cursor on every nav-stable render — not just
        // during a transition. Without `will-change` the transition
        // still runs; the only cost is a tiny one-time layer promotion
        // on first blur, which is imperceptible at 200ms.
        "transition-[filter,opacity] duration-200 ease-out",
        pending && "blur-[2px] opacity-70 pointer-events-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
