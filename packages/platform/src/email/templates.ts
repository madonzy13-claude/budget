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
  | "workspace-invite";

export interface TemplateVars {
  url?: string;
  workspace?: string;
  inviter?: string;
  [key: string]: unknown;
}

const FONT =
  "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;line-height:1.5;padding:24px;max-width:560px;margin:0 auto";

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

interface Strings {
  verify: CommonBlock;
  reset: CommonBlock;
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
<html><body style="${FONT}">
  <h2 style="margin:0 0 16px">${escapeHtml(heading)}</h2>
  <p>${escapeHtml(body)}</p>
  <p style="margin:24px 0">
    <a href="${safeUrl}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">${escapeHtml(cta)}</a>
  </p>
  <p style="font-size:13px;color:#666">${escapeHtml(pasteHint)}<br><code style="word-break:break-all">${safeUrl}</code></p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
  <p style="font-size:12px;color:#999">${escapeHtml(footer)}</p>
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
