/**
 * forecast-marks-ink.test.ts — the forecast band's own ink (user, 260813).
 *
 * The month names, the dashed month rules and the payment notches ride ON the
 * green/yellow/red band. They were the brand's on-colour BLACK, softened again
 * under the light theme because a dark mark on a saturated band is the loudest
 * thing on a pale card.
 *
 * They are white now — the member picked the strongest of four mockups. That
 * choice has a consequence worth pinning: the band's colours are the same in
 * both themes, so white ink stands in the same relation to them either way and
 * there is nothing left for the light scope to soften. One definition, no
 * override — if someone re-adds one, this fails.
 *
 * Same source-grep style as shell-safe-area.test.ts: these are CSS custom
 * properties, and jsdom will not resolve a color-mix() through two scopes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../src/app/global.css"), "utf8");

const TOKENS = ["--forecast-ink", "--forecast-rule", "--forecast-notch"];

/** Every declaration of a token, in source order. */
const declarationsOf = (token: string) =>
  [...css.matchAll(new RegExp(`${token}:\\s*([^;]+);`, "g"))].map((m) =>
    m[1]!.replace(/\s+/g, " ").trim(),
  );

describe("the ink the forecast band carries", () => {
  it("is white, so it reads the same on every colour the band takes", () => {
    for (const token of TOKENS) {
      const decls = declarationsOf(token);
      expect(decls.length).toBeGreaterThan(0);
      for (const d of decls) expect(d).toMatch(/#fff\b|#ffffff\b/i);
    }
  });

  it("is declared ONCE — the light theme has nothing left to soften", () => {
    for (const token of TOKENS) expect(declarationsOf(token)).toHaveLength(1);
  });

  it("keeps the marks quieter than the names, and the rules quietest", () => {
    // A month boundary is structure, a payment is texture, and the name is the
    // thing you actually read — the order they were tuned in (260812).
    const pctOf = (token: string) =>
      Number(/(\d+(?:\.\d+)?)%/.exec(declarationsOf(token)[0]!)![1]);
    expect(pctOf("--forecast-rule")).toBeLessThan(pctOf("--forecast-notch"));
    expect(pctOf("--forecast-notch")).toBeLessThan(pctOf("--forecast-ink"));
  });
});
