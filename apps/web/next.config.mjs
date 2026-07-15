import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const __dirname = dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" || process.env["DISABLE_SW"] === "1",
});

// Build-freshness stamp (260614-rwt): inlined at build time so the Settings
// footer can confirm on-device which build is running (the q1v debug overlay was
// removed). Prefers an explicit CI-supplied build id, then a short git SHA, else
// a build timestamp. Inlined via `env` → readable as NEXT_PUBLIC_BUILD_ID.
const BUILD_ID =
  process.env["NEXT_PUBLIC_BUILD_ID"] ??
  process.env["NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"]?.slice(0, 7) ??
  new Date().toISOString().slice(0, 16).replace("T", " ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // SPA/SWR router cache (quick-260616-spa). The BDP tab page shells
    // (wallets/reserves/spendings/settings) + home are now DATA-FREE static
    // shells — every dataset is client-fetched via React Query. Next 15 defaults
    // `staleTimes.dynamic` to 0, so a dynamic page (these are dynamic under the
    // force-dynamic (app) layout) is NEVER reused from the client Router Cache:
    // every pill/tab soft-nav did a fresh server RSC roundtrip (~100-300ms over
    // the tunnel — the "something is waiting" lag, and the hang the offline
    // nav-guard works around). Letting the Router Cache reuse a visited shell
    // makes warm soft-nav instant; React Query/SWR still owns data freshness
    // (refetchOnMount:"always" revalidates in the background after the reused
    // shell paints), so a reused shell is always correct, never stale data.
    staleTimes: { dynamic: 120, static: 300 },
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  // Force monorepo tracing root so the standalone bundle nests server.js
  // under `apps/web/server.js` in every environment. Without this, the
  // Docker `builder` stage (which only sees apps/web after install) emits
  // a flat `server.js` at the standalone root, breaking the runtime CMD.
  outputFileTracingRoot: resolve(__dirname, "../.."),
  // CLAUDE.md: Serwist requires Webpack; Turbopack is incompatible (as of May 2026)
  // Next.js 16 defaults to Turbopack. To build with Webpack, use: next build --webpack
  // CI grep gate requires: turbopack: false
  // turbopack: false -- do not use Turbopack (use --webpack build flag instead)
  async rewrites() {
    const apiBase = process.env["API_INTERNAL_URL"] ?? "http://api:4000";
    return [
      {
        source: "/auth/:path*",
        destination: `${apiBase}/auth/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
  // SEC: baseline security headers.
  //   - X-Frame-Options: DENY       → clickjacking on destructive actions
  //                                    (transfer-ownership, delete-budget, invite).
  //   - Referrer-Policy             → share-link tokens live in the URL path
  //                                    (/accept-invitation/:id, /budgets/join/:token);
  //                                    strip them from cross-origin Referer.
  //   - X-Content-Type-Options      → block MIME sniffing.
  //   - Content-Security-Policy     → the directives that add real defense
  //     WITHOUT a script-src nonce: base-uri blocks <base> injection (which
  //     rewrites every relative URL), object-src kills plugin/Flash vectors,
  //     frame-ancestors is the modern anti-clickjacking control, form-action
  //     pins form posts to same-origin. A full script-src/style-src CSP is
  //     intentionally deferred: the inline <head> bootstrap scripts in
  //     app/layout.tsx + Next.js's own inline runtime need per-request nonces
  //     threaded through middleware first, and a mis-scoped script-src silently
  //     breaks the PWA. That is the recommended follow-up, tracked separately.
  async headers() {
    const csp = [
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
