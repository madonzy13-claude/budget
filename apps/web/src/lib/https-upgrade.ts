// Decides whether a request must be redirected http→https before anything else.
//
// Better Auth issues a Secure session cookie (BETTER_AUTH_URL is https), which a
// browser refuses to store over http. An iOS PWA pinned to http:// therefore
// "signs in" but never keeps the cookie and loops back to /sign-in. Upgrading to
// https lets the Secure cookie land. Loopback + tailscale (.ts.net) dev hosts run
// genuine http and must be left alone (they'd have no TLS to upgrade to).
//
// `forwardedProto` is the edge-set X-Forwarded-Proto (Cloudflare); `host` is the
// Host header. Kept as a pure function so the decision is unit-testable.
export function shouldUpgradeToHttps(
  forwardedProto: string | null,
  host: string,
): boolean {
  if (forwardedProto !== "http" || !host) return false;
  // Strip the port, then unwrap a bracketed IPv6 literal ("[::1]:3000" → "::1").
  const bareHost = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0];
  const isDevHost =
    bareHost === "localhost" ||
    bareHost === "127.0.0.1" ||
    bareHost === "::1" ||
    bareHost.endsWith(".ts.net");
  return !isDevHost;
}
