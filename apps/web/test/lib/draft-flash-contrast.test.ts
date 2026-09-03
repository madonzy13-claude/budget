/**
 * The arrival highlight has to be VISIBLE in both themes.
 *
 * It was not. The flash lifted the row to --surface-elevated-dark, which in
 * dark is a 24-unit step off the row's resting surface and reads clearly — but
 * light's palette is a tight run of greys, where the same two tokens are
 * #e7eaef and #e2e6ec. Five units. Invisible, and shipped that way because the
 * dark theme was the one being looked at.
 *
 * So the contract is measured, not eyeballed: whatever token the flash uses
 * must differ from the row's resting surface by enough to see, in EVERY theme
 * the stylesheet defines. Reading the stylesheet is the point — a future
 * palette tweak that quietly closes the gap fails here rather than in someone's
 * eyes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(
  resolve(__dirname, "../../src/app/global.css"),
  "utf8",
);

/** The row's resting background, and the token the flash lifts it to. */
const RESTING = "--surface-sunken-dark";
const FLASH = "--draft-flash-surface";

/**
 * Minimum per-channel mean difference. The dark pair that demonstrably works
 * measures 24; the light pair that shipped invisible measured 5. Twelve sits
 * between them with room on both sides.
 */
const MIN_DELTA = 12;

/** Theme scopes in the stylesheet, by the selector that opens each block. */
const THEMES: Array<[string, RegExp]> = [
  ["dark (:root)", /:root\s*\{([\s\S]*?)\n\s{2}\}/],
  [
    "light ([data-theme=light])",
    /:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\s{2}\}/,
  ],
];

/** Last declaration of `name` inside a block — later wins in the cascade. */
function declared(block: string, name: string): string | undefined {
  const all = [...block.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, "g"))];
  return all.at(-1)?.[1]?.trim();
}

/** Resolve one level of `var(--x)` against the same block, then the dark root. */
function resolveToken(
  block: string,
  darkBlock: string,
  name: string,
): string | undefined {
  const raw = declared(block, name) ?? declared(darkBlock, name);
  if (!raw) return undefined;
  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!ref?.[1]) return raw;
  return declared(block, ref[1]) ?? declared(darkBlock, ref[1]);
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function meanDelta(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)) / 3;
}

describe("draft arrival flash contrast", () => {
  const darkBlock = CSS.match(THEMES[0]![1])?.[1] ?? "";

  for (const [label, re] of THEMES) {
    it(`${label}: the flash surface is distinguishable from the row`, () => {
      const block = CSS.match(re)?.[1];
      expect({ theme: label, blockFound: !!block }).toEqual({
        theme: label,
        blockFound: true,
      });

      const resting = resolveToken(block!, darkBlock, RESTING);
      const flash = resolveToken(block!, darkBlock, FLASH);
      expect({ theme: label, resting: !!resting, flash: !!flash }).toEqual({
        theme: label,
        resting: true,
        flash: true,
      });

      // Reported as the whole value so a failure names the two colours and the
      // gap, not just "expected 5 to be >= 12".
      const delta = meanDelta(resting!, flash!);
      expect({
        theme: label,
        resting,
        flash,
        visible: delta >= MIN_DELTA,
      }).toEqual({ theme: label, resting, flash, visible: true });
    });
  }

  it("the keyframe uses the token rather than a theme-specific colour", () => {
    // A literal hex in the keyframe is how this broke in the first place: one
    // theme's colour applied to both.
    const keyframe = CSS.match(/@keyframes draft-flash \{([\s\S]*?)\n\}/)?.[1];
    expect(keyframe).toBeTruthy();
    expect(keyframe).toContain(`var(${FLASH})`);
    expect(keyframe).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
