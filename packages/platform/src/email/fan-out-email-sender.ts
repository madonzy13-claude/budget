import type { EmailSender, EmailSendArgs } from "@budget/shared-kernel";

/**
 * Delivers each message through several senders. ALL senders are attempted
 * (a flaky real provider never costs the mailpit copy), then the FIRST
 * sender's failure — the primary/real transport — is propagated so a genuine
 * delivery error still surfaces. Secondary (mirror) failures are swallowed so
 * a downed dev catcher never blocks real mail.
 */
export class FanOutEmailSender implements EmailSender {
  private readonly senders: readonly EmailSender[];

  constructor(senders: readonly EmailSender[]) {
    if (senders.length === 0) {
      throw new Error("FanOutEmailSender requires at least one sender");
    }
    this.senders = senders;
  }

  async send(args: EmailSendArgs): Promise<void> {
    const results = await Promise.allSettled(
      this.senders.map((s) => s.send(args)),
    );
    const primary = results[0];
    if (primary && primary.status === "rejected") {
      throw primary.reason; // real-transport failure surfaces; mirrors already ran
    }
  }
}
