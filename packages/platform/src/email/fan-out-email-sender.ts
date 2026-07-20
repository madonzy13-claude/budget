import type { EmailSender, EmailSendArgs } from "@budget/shared-kernel";

/**
 * Delivers each message through several senders. The FIRST sender is the
 * primary (real transport): its failure propagates so a genuine delivery error
 * surfaces. Remaining senders (e.g. a mailpit mirror) are best-effort — their
 * failures are swallowed so a downed dev catcher never blocks real mail.
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
    const [primary, ...mirrors] = this.senders;
    await primary!.send(args); // primary failure propagates
    await Promise.allSettled(mirrors.map((s) => s.send(args))); // best-effort
  }
}
