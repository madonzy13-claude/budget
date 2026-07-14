import { describe, it, expect } from "vitest";

import { initialsOf } from "@/lib/initials";

// Shared by the header profile menu and the members list so both avatars read
// identically (bug #2: members list used a different fallback rule).
describe("initialsOf", () => {
  it("uses the first letters of the first two words", () => {
    expect(initialsOf("Ewa Yamada", "e@x.com")).toBe("EY");
  });

  it("falls back to the first two chars of a single word", () => {
    expect(initialsOf("madonzy", "m@x.com")).toBe("MA");
  });

  it("uses the email when the name is missing", () => {
    expect(initialsOf(undefined, "zoe@x.com")).toBe("ZO");
  });

  it("returns '?' when there is nothing to show", () => {
    expect(initialsOf("", "")).toBe("?");
    expect(initialsOf(undefined, undefined)).toBe("?");
  });
});
