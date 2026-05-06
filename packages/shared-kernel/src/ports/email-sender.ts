export interface EmailSender {
  send(args: {
    to: string;
    template: string;
    vars: Record<string, unknown>;
  }): Promise<void>;
}

export class StdoutEmailSender implements EmailSender {
  public sent: Array<{ to: string; template: string; vars: Record<string, unknown> }> = [];

  async send(args: { to: string; template: string; vars: Record<string, unknown> }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[stdout-email] ${args.template} → ${args.to}: ${JSON.stringify(args.vars)}`
    );
    this.sent.push(args);
  }
}
