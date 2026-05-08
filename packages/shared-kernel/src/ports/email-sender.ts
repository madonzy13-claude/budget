export type EmailLocale = "en" | "pl" | "uk";

export interface EmailSendArgs {
  to: string;
  template: string;
  vars: Record<string, unknown>;
  locale?: EmailLocale;
}

export interface EmailSender {
  send(args: EmailSendArgs): Promise<void>;
}

export class StdoutEmailSender implements EmailSender {
  public sent: Array<EmailSendArgs> = [];

  async send(args: EmailSendArgs): Promise<void> {
    console.log(
      `[stdout-email] ${args.template} (${args.locale ?? "en"}) → ${args.to}: ${JSON.stringify(args.vars)}`,
    );
    this.sent.push(args);
  }
}
