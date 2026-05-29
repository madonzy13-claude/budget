import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { LocaleCookieSync } from "@/components/common/locale-cookie-sync";
import {
  NavPendingOverlay,
  NavPendingProvider,
} from "@/components/common/nav-pending";
import { TopNav } from "@/components/budgeting/top-nav";
import { Toaster } from "@/components/ui/sonner";

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

  const session = await getServerSession();
  if (!session) {
    const cookieStore = await cookies();
    const hasStaleCookie = !!cookieStore.get("better-auth.session_token")
      ?.value;
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
       scroll, which is why the root is `h-dvh flex-col` and the main slot
       gets `flex-1 min-h-0 overflow-y-auto` — without min-h-0 the flex
       child grows past its parent and clips on mobile (regression seen
       after the D-08 onboarding-guard refactor). */
    /* NavPendingProvider tracks in-flight chrome navigation; NavPendingOverlay
       wraps the route children so they blur during the dead-zone between the
       click and the new RSC commit. The header sits OUTSIDE the overlay so
       the user can re-orient (and re-navigate) while the swap settles. */
    <NavPendingProvider>
      <div className="flex h-dvh flex-col bg-[var(--canvas-dark)] text-[var(--body-on-dark)]">
        <LocaleCookieSync accountLocale={session.user.locale ?? "en"} />
        <header className="z-50 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]/95 backdrop-blur">
          <TopNav locale={locale} activeBudgetId={activeBudgetId} />
        </header>
        <main className="flex flex-1 min-h-0 flex-col overflow-y-auto">
          {/* SiteFooter removed (UAT-Phase6-Test7 retest #2):
              the in-app shell no longer carries the marketing-style
              footer — the page is the product. */}
          <NavPendingOverlay className="flex-1">{children}</NavPendingOverlay>
        </main>
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
