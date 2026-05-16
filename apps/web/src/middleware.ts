import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "../i18n/routing";

const intlMiddleware = createMiddleware(routing);

const LOCALES = ["en", "pl", "uk"];
const AUTH_ROUTES = ["/sign-in", "/sign-up"];
const PROTECTED_ROUTES = ["/onboarding", "/budgets", "/settings"];
const SESSION_COOKIE = "better-auth.session_token";
// Holds the signed-in user's account locale (set on sign-in + by Settings,
// kept in sync by LocaleCookieSync). Logged-in users are redirected so the
// URL locale always matches this. Logged-out users keep whatever locale the
// URL carries.
const ACCOUNT_LOCALE_COOKIE = "budget-locale";

function extractLocale(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  return LOCALES.includes(segment) ? segment : "en";
}

function stripLocale(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  if (LOCALES.includes(segment)) {
    return pathname.slice(segment.length + 1) || "/";
  }
  return pathname;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!request.cookies.get(SESSION_COOKIE)?.value;
  const bare = stripLocale(pathname);
  const locale = extractLocale(pathname);
  const reason = request.nextUrl.searchParams.get("reason");
  const sessionExpired = reason === "session_expired" || reason === "required";

  // If the layout sent us to /sign-in with reason=session_expired (or =required),
  // the cookie that's "present" is actually stale. Strip it here so the user sees
  // the sign-in page once and doesn't loop:
  //   middleware-bounce-off-auth-page <-> layout-bounce-off-protected-page.
  if (sessionExpired && AUTH_ROUTES.some((r) => bare.startsWith(r))) {
    const res = intlMiddleware(request);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Logged-in users: the account locale is authoritative. If the URL carries a
  // different locale, redirect to the same path in the account locale. Only
  // Settings changes the account locale (and the cookie). Logged-out users are
  // left alone — for them the URL locale wins.
  if (isAuthenticated) {
    const accountLocale = request.cookies.get(ACCOUNT_LOCALE_COOKIE)?.value;
    if (
      accountLocale &&
      LOCALES.includes(accountLocale) &&
      locale !== accountLocale
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/${accountLocale}${bare === "/" ? "" : bare}`;
      return NextResponse.redirect(url);
    }
  }

  // Authenticated → redirect away from auth pages to the Phase 3 home (`/`)
  // which renders the per-budget card grid via `(app)/page.tsx`. The legacy
  // v1.0 destination `/${locale}/budgets` has no `page.tsx` after Phase 3
  // restructure (only `[id]/` and `new/` subroutes exist) so redirecting there
  // produced a 404 for every authenticated post-sign-in landing.
  if (isAuthenticated && AUTH_ROUTES.some((r) => bare.startsWith(r))) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // Unauthenticated → redirect away from protected pages
  if (!isAuthenticated && PROTECTED_ROUTES.some((r) => bare.startsWith(r))) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
  }

  // Final non-redirect pass: forward to next-intl while injecting an `x-pathname`
  // request header so downstream RSCs (e.g. (app)/layout.tsx) can derive the
  // current pathname via `headers()`. OVERWRITE the header (do not set-if-absent)
  // so any client-supplied value is discarded — defense against client spoofing
  // (T-03-04-06). next-intl's response carries its own headers/cookies; we merge
  // them onto the augmented NextResponse so locale handling is preserved.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const intlRes = intlMiddleware(request);

  // If next-intl returns a redirect (status 3xx — e.g. bare `/` → `/${defaultLocale}`),
  // return that response verbatim. Wrapping it in NextResponse.next() would
  // strip the redirect status and leave only the Location header on a 200,
  // which browsers do not follow — producing the blank-page-on-/ regression.
  if (intlRes.status >= 300 && intlRes.status < 400) return intlRes;

  const merged = NextResponse.next({ request: { headers: requestHeaders } });
  intlRes.headers.forEach((value, key) => merged.headers.set(key, value));
  intlRes.cookies
    .getAll()
    .forEach((c) => merged.cookies.set(c.name, c.value, c));
  return merged;
}

export const config = {
  // Match all pathnames except for:
  // - /api/* routes (handled by API server)
  // - /auth/* routes (proxied to Better Auth API server)
  // - /_next/* (Next.js internals)
  // - /.*\.* (static files with extension, e.g. favicon.ico)
  matcher: ["/((?!api|auth|_next|.*\\..*).*)"],
};
