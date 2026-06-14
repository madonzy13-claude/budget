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
};

export default withSerwist(withNextIntl(nextConfig));
