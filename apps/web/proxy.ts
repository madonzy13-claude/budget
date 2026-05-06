import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for:
  // - /api/* routes (handled by API server)
  // - /_next/* (Next.js internals)
  // - /.*\.* (static files with extension, e.g. favicon.ico)
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
