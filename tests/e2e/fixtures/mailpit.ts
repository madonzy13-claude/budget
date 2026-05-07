import { expect, type APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env["MAILPIT_URL"] ?? "http://localhost:8025";

export interface MailpitMessage {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

export interface MailpitMessageBody {
  Subject: string;
  HTML: string;
  Text: string;
}

export async function pollMailpitForRecipient(
  api: APIRequestContext,
  recipient: string,
  timeoutMs = 15000,
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no messages found";
  while (Date.now() < deadline) {
    const res = await api.get(`${MAILPIT_URL}/api/v1/messages`);
    if (res.ok()) {
      const body = (await res.json()) as { messages?: MailpitMessage[] };
      const match = (body.messages ?? []).find((m) =>
        m.To.some((a) => a.Address.toLowerCase() === recipient.toLowerCase()),
      );
      if (match) return match;
      lastError = `${body.messages?.length ?? 0} messages, none for ${recipient}`;
    } else {
      lastError = `mailpit ${res.status()}`;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for verification email: ${lastError}`);
}

export async function fetchMessageBody(
  api: APIRequestContext,
  messageId: string,
): Promise<MailpitMessageBody> {
  const res = await api.get(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as MailpitMessageBody;
}

export async function fetchVerifyUrl(
  api: APIRequestContext,
  messageId: string,
): Promise<string> {
  const body = await fetchMessageBody(api, messageId);
  const match = body.Text.match(
    /https?:\/\/\S+\/auth\/verify-email\?token=[^\s)]+/,
  );
  if (!match) throw new Error("verify URL not found in email body");
  return match[0];
}

/**
 * Rewrites the verification URL host to the test's baseURL host so that
 * cookies stay in one origin (critical for Tailscale vs. localhost mismatch).
 */
export function rewriteVerifyUrlToBaseHost(
  verifyUrl: string,
  baseUrl: string,
): string {
  const base = new URL(baseUrl);
  const target = new URL(verifyUrl);
  target.protocol = base.protocol;
  target.host = base.host;
  return target.toString();
}
