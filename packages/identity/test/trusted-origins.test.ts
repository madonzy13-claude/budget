import { describe, it, expect } from "bun:test";
import { buildTrustedOrigins } from "../src/adapters/persistence/better-auth";

describe("buildTrustedOrigins", () => {
  it("always includes APP_URL", () => {
    const origins = buildTrustedOrigins("http://localhost:3000");
    expect(origins).toContain("http://localhost:3000");
  });

  it("includes APP_URL + its scheme sibling when TRUSTED_ORIGINS is undefined", () => {
    const origins = buildTrustedOrigins("http://localhost:3000", undefined);
    expect(origins).toEqual([
      "http://localhost:3000",
      "https://localhost:3000",
    ]);
  });

  it("includes APP_URL + its scheme sibling when TRUSTED_ORIGINS is empty string", () => {
    const origins = buildTrustedOrigins("http://localhost:3000", "");
    expect(origins).toEqual([
      "http://localhost:3000",
      "https://localhost:3000",
    ]);
  });

  it("trusts the http SIBLING of an https origin (iPhone-8 http PWA fix)", () => {
    const origins = buildTrustedOrigins("https://budget-dev.madonzy.com");
    expect(origins).toContain("https://budget-dev.madonzy.com");
    expect(origins).toContain("http://budget-dev.madonzy.com");
  });

  it("parses comma-separated TRUSTED_ORIGINS", () => {
    const origins = buildTrustedOrigins(
      "http://localhost:3000",
      "http://localhost:3000,http://claude-code.tail4b2401.ts.net:3000",
    );
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://claude-code.tail4b2401.ts.net:3000");
  });

  it("trims whitespace from each origin", () => {
    const origins = buildTrustedOrigins(
      "http://localhost:3000",
      " http://staging.example.com , http://other.example.com ",
    );
    expect(origins).toContain("http://staging.example.com");
    expect(origins).toContain("http://other.example.com");
  });

  it("filters out blank entries from TRUSTED_ORIGINS", () => {
    const origins = buildTrustedOrigins(
      "http://localhost:3000",
      "http://a.example.com,,http://b.example.com,",
    );
    // blanks dropped; each origin also brings its https scheme-sibling.
    expect(origins).toEqual([
      "http://localhost:3000",
      "https://localhost:3000",
      "http://a.example.com",
      "https://a.example.com",
      "http://b.example.com",
      "https://b.example.com",
    ]);
  });
});
