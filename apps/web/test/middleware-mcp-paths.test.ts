/**
 * middleware-mcp-paths.test.ts — 15-19: the public host must hand MCP
 * discovery + transport straight to the API, untouched by next-intl, and the
 * consent page must never be served stale from the service-worker cache.
 *
 * The real middleware can't be imported under Vitest (next-intl pulls in
 * next/server), so the matcher is read from source and compiled the way Next
 * does for a single-group pattern.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { servesServerRenderedData } from "../sw-offline";

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

function matcher(): RegExp {
  const m = /matcher:\s*\[\s*"([^"]+)"\s*\]/.exec(src("src/middleware.ts"));
  if (!m) throw new Error("matcher not found");
  return new RegExp(`^${m[1]!.replace(/\\\\/g, "\\")}$`);
}

describe("MCP paths on the public host", () => {
  test("middleware leaves MCP, discovery and OAuth endpoints alone", () => {
    const re = matcher();
    for (const p of [
      "/mcp",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server/auth",
      "/auth/oauth2/authorize",
    ])
      expect(`${p}:${re.test(p)}`).toBe(`${p}:false`);
    for (const p of ["/en/settings", "/oauth/consent"])
      expect(`${p}:${re.test(p)}`).toBe(`${p}:true`);
  });

  test("rewrites /mcp and /.well-known to the API", () => {
    const cfg = src("next.config.mjs");
    expect(cfg).toContain('source: "/mcp"');
    expect(cfg).toContain("destination: `${apiBase}/mcp`");
    expect(cfg).toContain('source: "/.well-known/:path*"');
    expect(cfg).toContain("destination: `${apiBase}/.well-known/:path*`");
  });

  test("the consent page is never served from the SW cache", () => {
    expect(
      servesServerRenderedData("https://h/en/oauth/consent?client_id=x"),
    ).toBe(true);
    expect(servesServerRenderedData("https://h/en/budgets/1/settings")).toBe(
      false,
    );
  });
});
