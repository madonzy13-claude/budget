/**
 * build-guardrail.test.ts — the web image must not build without the push key
 * (user, 260810).
 *
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY is INLINED into the client bundle by `next
 * build`. Build without it and nothing fails: the image is healthy, the page
 * renders, and the notifications toggle is simply dead, because
 * pushManager.subscribe was handed an empty applicationServerKey. It has now
 * cost four rounds of "notifications don't work" (260803, 260806, 260809,
 * 260810).
 *
 * `make build-web` has guarded it since 260806, but a guard on one path is not
 * a guard: a bare `docker compose build web` walks straight past it, which is
 * exactly what happened. The assertion therefore lives in the Dockerfile, where
 * every path — make, compose, CI, a human — has to go through it.
 *
 * This test pins the two halves of that: the build fails without the key, and
 * CI supplies a placeholder so the smoke build still runs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** apps/web is vitest's cwd; the repo root is two up. */
const repo = (p: string) => resolve(process.cwd(), "../..", p);
const read = (p: string) => readFileSync(repo(p), "utf8");

describe("the web image cannot be built without the push key", () => {
  const dockerfile = read("apps/web/Dockerfile");

  it("asserts the key is non-empty in the Dockerfile itself", () => {
    // Wherever the check is worded, it has to TEST the variable and it has to
    // be able to fail.
    const guard = dockerfile
      .split("\n")
      .find(
        (l) =>
          l.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY") &&
          (l.includes("test -n") || l.includes("-z ")),
      );
    expect(guard).toBeDefined();
    expect(dockerfile).toContain("exit 1");
  });

  it("runs that assertion BEFORE next build, not after", () => {
    const lines = dockerfile.split("\n");
    const guardAt = lines.findIndex(
      (l) =>
        l.includes("test -n") && l.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    );
    // The RUN, not the comment above it that also says "next build".
    const buildAt = lines.findIndex(
      (l) => l.trimStart().startsWith("RUN") && l.includes("next build"),
    );
    expect(guardAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(guardAt);
  });

  it("names the way out, so the failure is actionable", () => {
    expect(dockerfile.toLowerCase()).toContain("infisical");
  });

  it("still lets CI build the stack, which has no real key", () => {
    // CI proves the image BUILDS; it never exercises push. A placeholder keeps
    // the guard honest everywhere it matters without blocking that.
    expect(read(".github/workflows/ci.yml")).toContain(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY=",
    );
  });
});
