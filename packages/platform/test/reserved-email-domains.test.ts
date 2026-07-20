import { describe, test, expect } from "bun:test";
import { StdoutEmailSender } from "@budget/shared-kernel";
import {
  isReservedEmailDomain,
  isLocalMailHost,
  SkipReservedDomainsEmailSender,
} from "../src/email/reserved-email-domains";

const args = (to: string) => ({ to, template: "verify-email", vars: {} });

describe("isReservedEmailDomain", () => {
  test("flags RFC-2606/6762 reserved + every E2E domain", () => {
    for (const to of [
      "phase3-e2e-1@test.local", // fresh-user fixture
      "someone@example.com",
      "user@example.test",
      "x@foo.invalid",
      "y@sub.localhost",
      "z@localhost",
    ]) {
      expect(isReservedEmailDomain(to)).toBe(true);
    }
  });

  test("allows real recipient domains", () => {
    for (const to of ["madonzy13@gmail.com", "a@resend.dev", "b@budget.app"]) {
      expect(isReservedEmailDomain(to)).toBe(false);
    }
  });

  test("returns false for malformed input", () => {
    expect(isReservedEmailDomain("not-an-email")).toBe(false);
    expect(isReservedEmailDomain("trailing@")).toBe(false);
  });
});

describe("isLocalMailHost", () => {
  test("flags local mail catchers", () => {
    for (const h of ["mailpit", "localhost", "127.0.0.1", "::1", "box.local"]) {
      expect(isLocalMailHost(h)).toBe(true);
    }
  });

  test("real providers are not local", () => {
    for (const h of [
      "smtp.resend.com",
      "email-smtp.eu-central-1.amazonaws.com",
    ]) {
      expect(isLocalMailHost(h)).toBe(false);
    }
  });
});

describe("SkipReservedDomainsEmailSender", () => {
  test("skips reserved recipients — inner never called, onSkip fired", async () => {
    const inner = new StdoutEmailSender();
    const skipped: string[] = [];
    const guard = new SkipReservedDomainsEmailSender(inner, (to) =>
      skipped.push(to),
    );
    await guard.send(args("e2e@test.local"));
    expect(inner.sent).toHaveLength(0);
    expect(skipped).toEqual(["e2e@test.local"]);
  });

  test("forwards real recipients to inner", async () => {
    const inner = new StdoutEmailSender();
    const guard = new SkipReservedDomainsEmailSender(inner);
    await guard.send(args("madonzy13@gmail.com"));
    expect(inner.sent.map((s) => s.to)).toEqual(["madonzy13@gmail.com"]);
  });
});
