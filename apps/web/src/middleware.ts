import createMiddleware from "next-intl/middleware";
import { routing } from "../i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for:
  // - /api/* routes (handled by API server)
  // - /auth/* routes (proxied to Better Auth API server)
  // - /_next/* (Next.js internals)
  // - /.*\.* (static files with extension, e.g. favicon.ico)
  matcher: ["/((?!api|auth|_next|.*\\..*).*)"],
};
