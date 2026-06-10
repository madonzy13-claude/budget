/**
 * Provision a fresh verified UAT user.
 * Signs up via /auth/sign-up/email, polls Mailpit for verification email,
 * follows the verify URL, returns credentials.
 */

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";

const email = `uat-${Date.now()}@example.com`;
const password = "TestPass123!";
const name = "UAT Tester";

async function main() {
  const signUpRes = await fetch(`${APP_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!signUpRes.ok) {
    const body = await signUpRes.text();
    throw new Error(`sign-up failed: ${signUpRes.status} ${body}`);
  }

  let verifyUrl: string | null = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (listRes.ok) {
      const list = (await listRes.json()) as {
        messages?: Array<{ ID: string; To: Array<{ Address: string }> }>;
      };
      const match = (list.messages ?? []).find((m) =>
        m.To.some((a) => a.Address.toLowerCase() === email.toLowerCase()),
      );
      if (match) {
        const bodyRes = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
        const body = (await bodyRes.json()) as { Text: string };
        const m = body.Text.match(
          /https?:\/\/\S+\/auth\/verify-email\?token=[^\s)]+/,
        );
        if (m) {
          verifyUrl = m[0];
          break;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!verifyUrl) throw new Error("Timed out waiting for verification email");

  const target = new URL(verifyUrl);
  const base = new URL(APP_URL);
  target.protocol = base.protocol;
  target.host = base.host;
  const verifyRes = await fetch(target.toString(), { redirect: "manual" });
  if (verifyRes.status >= 500) {
    throw new Error(`verify failed: ${verifyRes.status}`);
  }

  console.log(JSON.stringify({ email, password, name, verifyUrl: target.toString() }, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
