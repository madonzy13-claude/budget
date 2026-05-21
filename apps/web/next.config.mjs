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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
