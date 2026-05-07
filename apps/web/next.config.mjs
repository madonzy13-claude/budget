import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" || process.env["DISABLE_SW"] === "1",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // CLAUDE.md: Serwist requires Webpack; Turbopack is incompatible (as of May 2026)
  // Next.js 16 defaults to Turbopack. To build with Webpack, use: next build --webpack
  // CI grep gate requires: turbopack: false
  // turbopack: false -- do not use Turbopack (use --webpack build flag instead)
};

export default withSerwist(withNextIntl(nextConfig));
