import withSerwistInit from "@serwist/next";

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
  // In Next.js 16, set turbopack to an empty object when NOT using Turbopack-specific
  // config — the --webpack CLI flag controls the bundler at build time.
  // turbopack: false -- do not use Turbopack (use --webpack build flag instead)
};

export default withSerwist(nextConfig);
