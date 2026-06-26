/**
 * Email templates — Phase 1 plain HTML/text strings, localized to en/pl/uk.
 * Phase 2+: migrate to React Email per CLAUDE.md tech stack.
 */
import type { EmailLocale } from "@budget/shared-kernel";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type TemplateName =
  | "verify-email"
  | "reset-password"
  | "change-email"
  | "workspace-invite";

export interface TemplateVars {
  url?: string;
  workspace?: string;
  inviter?: string;
  newEmail?: string;
  [key: string]: unknown;
}

// DESIGN.md tokens (Binance Dark) — keep in sync with apps/web/src/app/global.css
const COLOR = {
  canvasDark: "#0b0e11",
  surfaceCardDark: "#1e2329",
  hairlineOnDark: "#2b3139",
  primary: "#fcd535",
  onPrimary: "#181a20",
  onDark: "#ffffff",
  body: "#eaecef",
  muted: "#707a8a",
} as const;

const FONT_STACK =
  "Inter,BinanceNova,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface CommonBlock {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  pasteHint: string;
  footer: string;
}

interface InviteBlock {
  subject: (workspace: string) => string;
  heading: (workspace: string) => string;
  body: (inviter: string, workspace: string) => string;
  cta: string;
  pasteHint: string;
  footer: string;
}

interface ChangeEmailBlock {
  subject: string;
  heading: string;
  body: (newEmail: string) => string;
  cta: string;
  pasteHint: string;
  footer: string;
}

interface Strings {
  verify: CommonBlock;
  reset: CommonBlock;
  changeEmail: ChangeEmailBlock;
  invite: InviteBlock;
}

const STRINGS: Record<EmailLocale, Strings> = {
  en: {
    verify: {
      subject: "Verify your email — Budget",
      heading: "Verify your email",
      body: "Click the button below to confirm your address and activate your Budget account.",
      cta: "Verify email",
      pasteHint: "Or paste this URL into your browser:",
      footer: "If you did not sign up for Budget, ignore this email.",
    },
    reset: {
      subject: "Reset your password — Budget",
      heading: "Reset your password",
      body: "We received a request to reset your Budget password. Click the button below to choose a new one. The link expires in 30 minutes.",
      cta: "Reset password",
      pasteHint: "Or paste this URL into your browser:",
      footer:
        "If you did not request a password reset, ignore this email — your password will remain unchanged.",
    },
    changeEmail: {
      subject: "Confirm your email change — Budget",
      heading: "Confirm your email change",
      body: (newEmail) =>
        `We received a request to change your Budget email address to ${newEmail}. Click the button below to confirm. After confirming, you'll get a verification link at the new address.`,
      cta: "Confirm email change",
      pasteHint: "Or paste this URL into your browser:",
      footer:
        "If you did not request this change, ignore this email — your email address will remain unchanged.",
    },
    invite: {
      subject: (ws) => `Join "${ws}" on Budget`,
      heading: (ws) => `You've been invited to "${ws}"`,
      body: (inviter, ws) =>
        `${inviter} invited you to collaborate on the "${ws}" workspace in Budget. Click the button below to accept.`,
      cta: "Accept invitation",
      pasteHint: "Or paste this URL into your browser:",
      footer:
        "If you weren't expecting this invitation, ignore this email — no account will be created.",
    },
  },
  pl: {
    verify: {
      subject: "Potwierdź swój adres e-mail — Budget",
      heading: "Potwierdź swój adres e-mail",
      body: "Kliknij przycisk poniżej, aby potwierdzić swój adres i aktywować konto Budget.",
      cta: "Potwierdź adres e-mail",
      pasteHint: "Lub wklej ten adres URL do przeglądarki:",
      footer: "Jeśli nie zakładałeś/aś konta Budget, zignoruj tę wiadomość.",
    },
    reset: {
      subject: "Zresetuj hasło — Budget",
      heading: "Zresetuj hasło",
      body: "Otrzymaliśmy prośbę o zresetowanie hasła do konta Budget. Kliknij przycisk poniżej, aby wybrać nowe hasło. Link wygasa po 30 minutach.",
      cta: "Zresetuj hasło",
      pasteHint: "Lub wklej ten adres URL do przeglądarki:",
      footer:
        "Jeśli to nie Ty prosiłeś/aś o reset hasła, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.",
    },
    changeEmail: {
      subject: "Potwierdź zmianę adresu e-mail — Budget",
      heading: "Potwierdź zmianę adresu e-mail",
      body: (newEmail) =>
        `Otrzymaliśmy prośbę o zmianę adresu e-mail konta Budget na ${newEmail}. Kliknij przycisk poniżej, aby potwierdzić. Po potwierdzeniu otrzymasz link weryfikacyjny na nowy adres.`,
      cta: "Potwierdź zmianę adresu",
      pasteHint: "Lub wklej ten adres URL do przeglądarki:",
      footer:
        "Jeśli to nie Ty prosiłeś/aś o tę zmianę, zignoruj tę wiadomość — Twój adres e-mail pozostanie bez zmian.",
    },
    invite: {
      subject: (ws) => `Dołącz do "${ws}" na Budget`,
      heading: (ws) => `Otrzymałeś/aś zaproszenie do "${ws}"`,
      body: (inviter, ws) =>
        `${inviter} zaprasza Cię do współpracy nad obszarem roboczym "${ws}" w Budget. Kliknij poniżej, aby zaakceptować.`,
      cta: "Akceptuj zaproszenie",
      pasteHint: "Lub wklej ten adres URL do przeglądarki:",
      footer:
        "Jeśli nie spodziewałeś/aś się tego zaproszenia, zignoruj tę wiadomość — żadne konto nie zostanie utworzone.",
    },
  },
  uk: {
    verify: {
      subject: "Підтвердьте електронну адресу — Budget",
      heading: "Підтвердьте електронну адресу",
      body: "Натисніть кнопку нижче, щоб підтвердити адресу й активувати ваш обліковий запис Budget.",
      cta: "Підтвердити адресу",
      pasteHint: "Або вставте це посилання у браузер:",
      footer: "Якщо ви не реєструвалися в Budget, проігноруйте цей лист.",
    },
    reset: {
      subject: "Скидання пароля — Budget",
      heading: "Скидання пароля",
      body: "Ми отримали запит на скидання пароля до облікового запису Budget. Натисніть кнопку нижче, щоб обрати новий пароль. Посилання діє 30 хвилин.",
      cta: "Скинути пароль",
      pasteHint: "Або вставте це посилання у браузер:",
      footer:
        "Якщо ви не запитували скидання пароля, проігноруйте цей лист — ваш пароль залишиться без змін.",
    },
    changeEmail: {
      subject: "Підтвердьте зміну електронної адреси — Budget",
      heading: "Підтвердьте зміну електронної адреси",
      body: (newEmail) =>
        `Ми отримали запит на зміну електронної адреси облікового запису Budget на ${newEmail}. Натисніть кнопку нижче, щоб підтвердити. Після підтвердження ви отримаєте посилання для підтвердження на нову адресу.`,
      cta: "Підтвердити зміну адреси",
      pasteHint: "Або вставте це посилання у браузер:",
      footer:
        "Якщо ви не запитували цю зміну, проігноруйте цей лист — ваша електронна адреса залишиться без змін.",
    },
    invite: {
      subject: (ws) => `Приєднайтесь до "${ws}" в Budget`,
      heading: (ws) => `Вас запросили до "${ws}"`,
      body: (inviter, ws) =>
        `${inviter} запрошує вас до робочого простору "${ws}" у Budget. Натисніть кнопку нижче, щоб прийняти.`,
      cta: "Прийняти запрошення",
      pasteHint: "Або вставте це посилання у браузер:",
      footer:
        "Якщо ви не очікували цього запрошення, проігноруйте цей лист — обліковий запис не буде створено.",
    },
  },
};

function htmlShell(
  heading: string,
  body: string,
  cta: string,
  url: string,
  pasteHint: string,
  footer: string,
): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.canvasDark};font-family:${FONT_STACK};color:${COLOR.body};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.canvasDark};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:0 0 24px 0;">
              <span style="font-family:${FONT_STACK};font-size:20px;font-weight:700;letter-spacing:0.02em;color:${COLOR.primary};text-transform:uppercase;">Budget</span>
            </td>
          </tr>
          <tr>
            <td style="background:${COLOR.surfaceCardDark};border-radius:12px;padding:32px;">
              <h1 style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:24px;font-weight:600;line-height:1.3;color:${COLOR.onDark};">${escapeHtml(heading)}</h1>
              <p style="margin:0 0 28px 0;font-size:14px;line-height:1.5;color:${COLOR.body};">${escapeHtml(body)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:${COLOR.primary};border-radius:6px;">
                    <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:14px;font-weight:600;line-height:1;color:${COLOR.onPrimary};text-decoration:none;">${escapeHtml(cta)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:1.5;color:${COLOR.muted};">${escapeHtml(pasteHint)}</p>
              <p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safeUrl}" style="color:${COLOR.primary};text-decoration:none;">${safeUrl}</a></p>
              <hr style="border:none;border-top:1px solid ${COLOR.hairlineOnDark};margin:28px 0;">
              <p style="margin:0;font-size:12px;line-height:1.4;color:${COLOR.muted};">${escapeHtml(footer)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0 0;font-size:12px;color:${COLOR.muted};text-align:center;">Budget — Family budgeting &amp; wealth tracker</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

function textShell(
  heading: string,
  body: string,
  url: string,
  pasteHint: string,
  footer: string,
): string {
  return `${heading}\n\n${body}\n\n${pasteHint}\n${url}\n\n${footer}`;
}

function pickLocale(locale?: string): EmailLocale {
  if (locale === "pl" || locale === "uk" || locale === "en") return locale;
  return "en";
}

function renderVerifyEmail(
  vars: TemplateVars,
  locale: EmailLocale,
): RenderedEmail {
  const url = String(vars.url ?? "");
  const s = STRINGS[locale].verify;
  return {
    subject: s.subject,
    html: htmlShell(s.heading, s.body, s.cta, url, s.pasteHint, s.footer),
    text: textShell(s.heading, s.body, url, s.pasteHint, s.footer),
  };
}

function renderResetPassword(
  vars: TemplateVars,
  locale: EmailLocale,
): RenderedEmail {
  const url = String(vars.url ?? "");
  const s = STRINGS[locale].reset;
  return {
    subject: s.subject,
    html: htmlShell(s.heading, s.body, s.cta, url, s.pasteHint, s.footer),
    text: textShell(s.heading, s.body, url, s.pasteHint, s.footer),
  };
}

function renderChangeEmail(
  vars: TemplateVars,
  locale: EmailLocale,
): RenderedEmail {
  const url = String(vars.url ?? "");
  const newEmail = String(vars.newEmail ?? "");
  const s = STRINGS[locale].changeEmail;
  const body = s.body(newEmail);
  return {
    subject: s.subject,
    html: htmlShell(s.heading, body, s.cta, url, s.pasteHint, s.footer),
    text: textShell(s.heading, body, url, s.pasteHint, s.footer),
  };
}

function renderWorkspaceInvite(
  vars: TemplateVars,
  locale: EmailLocale,
): RenderedEmail {
  const url = String(vars.url ?? "");
  const workspace = String(vars.workspace ?? "");
  const inviter = String(vars.inviter ?? "");
  const s = STRINGS[locale].invite;
  return {
    subject: s.subject(workspace),
    html: htmlShell(
      s.heading(workspace),
      s.body(inviter, workspace),
      s.cta,
      url,
      s.pasteHint,
      s.footer,
    ),
    text: textShell(
      s.heading(workspace),
      s.body(inviter, workspace),
      url,
      s.pasteHint,
      s.footer,
    ),
  };
}

const RENDERERS: Record<
  TemplateName,
  (vars: TemplateVars, locale: EmailLocale) => RenderedEmail
> = {
  "verify-email": renderVerifyEmail,
  "reset-password": renderResetPassword,
  "change-email": renderChangeEmail,
  "workspace-invite": renderWorkspaceInvite,
};

export function renderEmail(
  template: string,
  vars: Record<string, unknown>,
  locale?: string,
): RenderedEmail {
  const renderer = RENDERERS[template as TemplateName];
  if (!renderer) {
    throw new Error(`Unknown email template: ${template}`);
  }
  return renderer(vars as TemplateVars, pickLocale(locale));
}
