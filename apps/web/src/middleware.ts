import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "../i18n/routing";

const intlMiddleware = createMiddleware(routing);

const LOCALES = ["en", "pl", "uk"];
const AUTH_ROUTES = ["/sign-in", "/sign-up"];
const PROTECTED_ROUTES = ["/onboarding", "/workspaces", "/settings"];
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

  // Authenticated → redirect away from auth pages
  if (isAuthenticated && AUTH_ROUTES.some((r) => bare.startsWith(r))) {
    return NextResponse.redirect(new URL(`/${locale}/workspaces`, request.url));
  }

  // Unauthenticated → redirect away from protected pages
  if (!isAuthenticated && PROTECTED_ROUTES.some((r) => bare.startsWith(r))) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except for:
  // - /api/* routes (handled by API server)
  // - /auth/* routes (proxied to Better Auth API server)
  // - /_next/* (Next.js internals)
  // - /.*\.* (static files with extension, e.g. favicon.ico)
  matcher: ["/((?!api|auth|_next|.*\\..*).*)"],
};
