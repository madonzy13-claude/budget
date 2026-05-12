import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "../i18n/routing";

const intlMiddleware = createMiddleware(routing);

const LOCALES = ["en", "pl", "uk"];
const AUTH_ROUTES = ["/sign-in", "/sign-up"];
const PROTECTED_ROUTES = ["/onboarding", "/budgets", "/settings"];
const SESSION_COOKIE = "better-auth.session_token";

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

  // Authenticated → redirect away from auth pages
  if (isAuthenticated && AUTH_ROUTES.some((r) => bare.startsWith(r))) {
    return NextResponse.redirect(new URL(`/${locale}/budgets`, request.url));
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
