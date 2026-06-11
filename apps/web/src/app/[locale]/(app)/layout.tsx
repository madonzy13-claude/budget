import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession, ServerUnavailableError } from "@/lib/server-session";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { LocaleCookieSync } from "@/components/common/locale-cookie-sync";
import {
  NavPendingOverlay,
  NavPendingProvider,
} from "@/components/common/nav-pending";
import { TopNav } from "@/components/budgeting/top-nav";
import { Toaster } from "@/components/ui/sonner";
import { PullToRefresh } from "@/components/common/pull-to-refresh";
import { InstallBanner } from "@/components/common/install-banner";
import { ViewportDebug } from "@/components/common/viewport-debug";
import { OfflineStatusBadge } from "@/components/common/offline-status-badge";
import { SyncIssuesList } from "@/components/common/sync-issues-list";

// The (app) shell is per-user: session lookup, onboarding-progress fetch,
// and the budget switcher all depend on the request's cookies. Without this
// Next.js statically prerenders /en at build time, baking in the
// no-session empty-hero HTML and skipping the layout's onboarding redirect
// (the fetch never reaches the api on real requests).
export const dynamic = "force-dynamic";

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Authenticated app shell. DESIGN.md `top-nav-dark` — 64px height, dark canvas,
 * yellow brand mark left, switcher + new-budget + locale + sign-out cluster.
 *
 * Authentication gate: validates the session via Better Auth (`/auth/get-session`)
 * before rendering. The web `middleware.ts` only checks cookie *presence*; this
 * layout is what catches a STALE cookie (token wiped from DB / expired session)
 * and redirects to /sign-in?reason=session_expired so the user gets a clear
 * "your session expired" message instead of a raw 401 from the API mid-action.
 *
 * activeBudgetId is derived from the middleware-injected `x-pathname` request
 * header. If missing (e.g. middleware bypass / direct RSC invocation in tests),
 * the switcher renders without an active row — graceful degradation. The regex
 * REQUIRES a UUID so non-budget paths like `/en/settings` won't match.
 */
export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { locale } = await params;

  // Three outcomes from getServerSession:
  //   1. ServerSession           → continue rendering the shell.
  //   2. null                    → no valid session → redirect to /sign-in.
  //   3. ServerUnavailableError  → the API container is unreachable. Do NOT
  //      bounce the user to /sign-in (the sign-in form itself depends on the
  //      API to work — they would get a confusing dead-end on mobile, which
  //      is the original bug). Instead surface a dedicated server-down
  //      screen with a Retry button.
  //
  // redirect() works by throwing NEXT_REDIRECT, so we collect the intent in
  // the try block and call redirect() outside — same pattern the onboarding
  // guard below uses.
  let session: Awaited<ReturnType<typeof getServerSession>> | undefined;
  let serverDown = false;
  try {
    session = await getServerSession();
  } catch (e) {
    if (e instanceof ServerUnavailableError) {
      serverDown = true;
    } else {
      throw e;
    }
  }
  if (serverDown) {
    // Preserve the originally-requested pathname (read from the
    // middleware-injected x-pathname header — same source the active-budget
    // detection uses). The /server-down card hard-reloads to this URL once
    // the health probe succeeds, so the user lands on the page they were
    // trying to reach instead of being stranded on /server-down after the
    // API comes back. Without the hint we would reload /server-down itself
    // — which the layout doesn't re-run for, leaving the user stuck.
    const hdrs = await headers();
    const intendedPath =
      hdrs.get("x-middleware-request-x-pathname") ?? hdrs.get("x-pathname");
    const params = new URLSearchParams();
    if (intendedPath && !intendedPath.endsWith("/server-down")) {
      params.set("next", intendedPath);
    }
    const qs = params.toString();
    redirect(`/${locale}/server-down${qs ? `?${qs}` : ""}`);
  }
  if (!session) {
    const cookieStore = await cookies();
    // Better Auth prefixes the cookie `__Secure-` over HTTPS — check both.
    const hasStaleCookie =
      !!cookieStore.get("__Secure-better-auth.session_token")?.value ||
      !!cookieStore.get("better-auth.session_token")?.value;
    const reason = hasStaleCookie ? "session_expired" : "required";
    redirect(`/${locale}/sign-in?reason=${reason}`);
  }

  const hdrs = await headers();
  // Next.js exposes middleware-injected request headers behind an
  // `x-middleware-request-` prefix in RSC `headers()`. We read both forms
  // so the layout works whether Next prefixes the key or not.
  const pathname =
    hdrs.get("x-middleware-request-x-pathname") ?? hdrs.get("x-pathname");
  const activeBudgetId = extractActiveBudgetId(pathname);

  // D-08: Incomplete-onboarding force-redirect guard.
  // Rules (in order):
  //   1. No row (404) → EXIT EARLY — existing pre-feature users must NOT be trapped.
  //   2. Row exists with completed_at !== null → already finished, no redirect.
  //   3. Row exists with completed_at === null AND not already on /budgets/new → redirect.
  if (pathname && !pathname.includes("/budgets/new")) {
    // IMPORTANT: do not call redirect() inside try/catch. Next.js implements
    // redirect() by throwing a NEXT_REDIRECT sentinel error that the router
    // catches at the framework boundary; wrapping it in a local catch
    // swallows the throw and no redirect ever fires (the original bug here).
    // We fetch + parse inside try (to swallow real network errors), record
    // the desired target, and call redirect() outside.
    let redirectTo: string | null = null;
    try {
      // Fetch both in parallel: the user's onboarding progress AND their
      // list of accessible budgets. Even when onboarding_progress is
      // incomplete, if the user already has at least one budget we treat
      // onboarding as effectively done and do NOT route them back into the
      // wizard. The wizard is for the FIRST-budget flow; once the user has
      // any budget, the home grid is the right destination.
      const [progressRes, activeRes] = await Promise.all([
        serverApiFetch(null, "/onboarding/progress"),
        serverApiFetch(null, "/budgets/active"),
      ]);
      let hasAnyBudget = false;
      if (activeRes.ok) {
        const body = (await activeRes.json()) as {
          budgets?: unknown[];
          workspaces?: unknown[];
        };
        const list = body.budgets ?? body.workspaces ?? [];
        hasAnyBudget = list.length > 0;
      }
      if (progressRes.status === 200 && !hasAnyBudget) {
        const progress = (await progressRes.json()) as {
          completedAt?: string | null;
        };
        // Only redirect when onboarding is genuinely incomplete (completed_at is strictly null).
        // undefined means malformed/absent response — treat as safe, no redirect.
        // The wizard runs deferred-create — there is no mid-wizard server
        // state to resume from, so we always route to /budgets/new and
        // let the wizard render its welcome screen.
        if (progress.completedAt === null) {
          redirectTo = `/${locale}/budgets/new`;
        }
      }
      // 404 or any other status → no row → EXIT EARLY (existing users not trapped)
    } catch {
      // Any fetch error → fall through gracefully (never block the layout)
    }
    if (redirectTo) redirect(redirectTo);
  }

  return (
    /* global.css locks html + body to height:100% + overflow:hidden (anti
       rubber-band guard for iOS). The (app) shell must therefore own the
       scroll, which is why the root is `h-lvh flex-col` and the main slot
       gets `flex-1 min-h-0 overflow-y-auto` — without min-h-0 the flex
       child grows past its parent and clips on mobile (regression seen
       after the D-08 onboarding-guard refactor). */
    /* NavPendingProvider tracks in-flight chrome navigation; NavPendingOverlay
       wraps the route children so they blur during the dead-zone between the
       click and the new RSC commit. The header sits OUTSIDE the overlay so
       the user can re-orient (and re-navigate) while the swap settles. */
    <NavPendingProvider>
      <div className="flex h-lvh flex-col bg-[var(--canvas-dark)] text-[var(--body-on-dark)]">
        <LocaleCookieSync accountLocale={session.user.locale ?? "en"} />
        {/* PullToRefresh is mounted once at the shell level so every
            authenticated route inherits the gesture automatically.
            It lives OUTSIDE the blurred subtree below so the indicator
            stays crisp while the rest of the shell (header + main)
            softens during the pull. Nested-scroll safety is built in —
            see pull-to-refresh.tsx (the gesture bails when any inner
            scroll container has scrolled past the top). */}
        <PullToRefresh />
        {/* Blur target spans header + main so the top nav also blurs
            during the pull-to-refresh gesture. PullToRefresh drives
            `--ptr-blur` on the root element; the filter interpolates
            0 → 8px during the gesture and holds at peak while the
            reload kicks in. The 150ms ease-out transition animates
            the release-back-to-crisp when the user lets go below the
            threshold. Toaster + LocaleCookieSync sit outside the blur
            wrap so sonner overlays and the locale-sync side-effect
            are unaffected. */}
        <div
          data-ptr-blur-target
          className="flex flex-1 min-h-0 flex-col"
          style={{
            // UAT round 17: drive filter via `--ptr-filter` so the
            // default value is the keyword `none` (not `blur(0px)`).
            // `blur(0)` is still a non-`none` filter and creates a
            // containing block for `position: fixed` children per CSS
            // spec — that broke dnd-kit's <DragOverlay> ghost
            // positioning on the Wallets page (ghost rendered offset
            // below the cursor instead of under it). With `none` no
            // containing block is established at rest.
            filter: "var(--ptr-filter, none)",
            transition: "filter 150ms ease-out",
          }}
        >
          <InstallBanner />
          {/* UAT-08 device diagnostics — renders only with ?vpdbg=1. */}
          <ViewportDebug />
          {/* Global offline/sync indicators (PWAX-02/03) — render app-wide. */}
          <OfflineStatusBadge />
          <SyncIssuesList />
          {/* pt-[env(safe-area-inset-top)]: with viewport-fit=cover the page
              extends under the status bar in standalone mode — the header
              absorbs the inset so the nav stays below the clock/notch.
              Resolves to 0 in browser tabs. */}
          <header className="z-50 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
            <TopNav locale={locale} activeBudgetId={activeBudgetId} />
          </header>
          {/* overscroll-y-none mirrors the global.css rule on html+body.
              <main> is the real scroll surface (body is locked
              overflow:hidden), so without this class iOS rubber-bands
              the page when content overflows — visibly stretching the
              BDP sticky pills bar on Wallets / Reserves (pages where
              children are taller than the viewport). Spendings avoids
              this with its own inner overscroll-contain container;
              Settings doesn't overflow. Anchoring it here fixes both
              bug sites and any future overflowing page in the (app)
              shell.
              SiteFooter removed (UAT-Phase6-Test7 retest #2): the
              in-app shell no longer carries the marketing-style
              footer — the page is the product. */}
          {/* data-shell-scroll: global.css pads this surface with
              env(safe-area-inset-bottom) so the last rows clear iOS
              Safari's floating bottom bar — and zeroes the padding in
              display-mode standalone, where the same inset rendered as a
              dead band above the home indicator (UAT-08 regression). */}
          <main
            data-shell-scroll
            className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-y-none"
          >
            <NavPendingOverlay className="flex-1">{children}</NavPendingOverlay>
          </main>
        </div>
        <Toaster />
      </div>
    </NavPendingProvider>
  );
}

/**
 * Match `/(en|pl|uk)/budgets/<uuid>(/...)?` — UUID required so non-budget
 * paths (e.g. /en/settings, /en/budgets/new) don't accidentally match.
 */
function extractActiveBudgetId(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(
    /\/budgets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i,
  );
  return m ? (m[1] ?? null) : null;
}
