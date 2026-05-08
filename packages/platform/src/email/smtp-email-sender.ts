import nodemailer, { type Transporter } from "nodemailer";
import type { EmailSender, EmailSendArgs } from "@budget/shared-kernel";
import { renderEmail } from "./templates";

export interface SmtpEmailSenderConfig {
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
  /**
   * If true, use TLS. Defaults to false for local Mailpit (port 1025, plain SMTP).
   * Production senders (e.g. Postmark, SES on 587) should set true with secure: false (STARTTLS).
   */
  secure?: boolean;
}

export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpEmailSenderConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth:
        config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
    });
  }

  async send(args: EmailSendArgs): Promise<void> {
    const rendered = renderEmail(args.template, args.vars, args.locale);
    await this.transporter.sendMail({
      from: this.from,
      to: args.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  }
}
