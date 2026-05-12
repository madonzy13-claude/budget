import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { SiteFooter } from "@/components/common/site-footer";
import { TopNav } from "@/components/budgeting/top-nav";

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
  const pathname = hdrs.get("x-pathname");
  const activeBudgetId = extractActiveBudgetId(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas-dark)] text-[var(--body-on-dark)]">
      <header className="sticky top-0 z-50 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]/95 backdrop-blur">
        <TopNav locale={locale} activeBudgetId={activeBudgetId} />
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
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
