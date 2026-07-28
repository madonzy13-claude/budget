import { describe, test, expect } from "bun:test";
import {
  StdoutEmailSender,
  type EmailSender,
  type EmailSendArgs,
} from "@budget/shared-kernel";
import { FanOutEmailSender } from "../src/email/fan-out-email-sender";

class ThrowingSender implements EmailSender {
  public calls = 0;
  constructor(private readonly label: string) {}
  async send(_args: EmailSendArgs): Promise<void> {
    this.calls++;
    throw new Error(`${this.label} failed`);
  }
}

const args: EmailSendArgs = {
  to: "user@gmail.com",
  template: "verify",
  vars: {},
};

describe("FanOutEmailSender", () => {
  test("delivers through every sender", async () => {
    const a = new StdoutEmailSender();
    const b = new StdoutEmailSender();
    await new FanOutEmailSender([a, b]).send(args);
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
  });

  test("primary failure STILL delivers to mirrors, then propagates", async () => {
    // A flaky real provider (cold TLS, transient reject) must not cost the
    // mailpit copy — the mirror always runs; the primary error still surfaces.
    const primary = new ThrowingSender("primary");
    const mirror = new StdoutEmailSender();
    const fan = new FanOutEmailSender([primary, mirror]);
    await expect(fan.send(args)).rejects.toThrow("primary failed");
    expect(mirror.sent).toHaveLength(1);
  });

  test("secondary failure is swallowed once primary succeeds", async () => {
    const primary = new StdoutEmailSender();
    const mirror = new ThrowingSender("mirror");
    await new FanOutEmailSender([primary, mirror]).send(args); // must NOT throw
    expect(primary.sent).toHaveLength(1);
    expect(mirror.calls).toBe(1);
  });

  test("rejects an empty sender list", () => {
    expect(() => new FanOutEmailSender([])).toThrow();
  });
});
