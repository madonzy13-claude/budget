import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
const { Given, When, Then } = createBdd(test);

function mailpitBaseUrl(): string {
  return process.env.MAILPIT_URL ?? "http://localhost:8025";
}

// Poll mailpit for the most recent password-reset email to {email} and return
// the reset token embedded in its body. Mirrors the verification poller in
// fresh-user-per-scenario.ts.
async function fetchResetToken(email: string): Promise<string> {
  const mailpit = mailpitBaseUrl();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const list = (await fetch(
      `${mailpit}/api/v1/messages?query=to:${encodeURIComponent(email)}`,
    )
      .then((r) => r.json())
      .catch(() => ({}))) as {
      messages?: Array<{
        ID: string;
        Subject?: string;
        To?: Array<{ Address?: string }>;
      }>;
    };
    const msg = list.messages?.find(
      (m) =>
        m.To?.[0]?.Address === email &&
        typeof m.Subject === "string" &&
        m.Subject.toLowerCase().includes("reset"),
    );
    if (msg) {
      const detail = (await fetch(`${mailpit}/api/v1/message/${msg.ID}`).then(
        (r) => r.json(),
      )) as { HTML?: string; Text?: string };
      const body = detail.HTML ?? detail.Text ?? "";
      // Better Auth puts the token as a PATH segment:
      // <base>/auth/reset-password/<TOKEN>?callbackURL=/en/reset-password
      // (the GET handler validates it then redirects to <callbackURL>?token=<TOKEN>).
      const m =
        body.match(/\/auth\/reset-password\/([^?&"'\s<>]+)/) ??
        body.match(/[?&]token=([^&"'\s<>]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`mailpit reset email never arrived for ${email} (15s)`);
}

Given("I am signed out in the browser", async ({ context }) => {
  await context.clearCookies();
});

When(
  "I request a password reset for my account",
  async ({ page, freshUser }) => {
    await page.goto("/en/forgot-password");
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    await page.getByTestId("forgot-email").fill(freshUser.email);
    await page.getByTestId("forgot-submit").click();
  },
);

Then("I see the reset-sent confirmation", async ({ page }) => {
  await page
    .getByTestId("forgot-success")
    .waitFor({ state: "visible", timeout: 10000 });
});

When("I open the reset link from my email", async ({ page, freshUser }) => {
  const token = await fetchResetToken(freshUser.email);
  await page.goto(`/en/reset-password?token=${encodeURIComponent(token)}`);
  await page
    .getByTestId("reset-password-input")
    .waitFor({ state: "visible", timeout: 10000 });
});

When("I set a new password {string}", async ({ page }, pw: string) => {
  await page.getByTestId("reset-password-input").fill(pw);
  await page.getByTestId("reset-submit").click();
});

Then("I land on the sign-in page", async ({ page }) => {
  await page.waitForURL((url) => url.toString().includes("/sign-in"), {
    timeout: 10000,
  });
});

When("I open the reset page without a token", async ({ page }) => {
  await page.goto("/en/reset-password");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

Then("I see the expired-token error", async ({ page }) => {
  await page
    .getByTestId("reset-error")
    .waitFor({ state: "visible", timeout: 10000 });
});

When("I open the sign-in page", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

When("I click the forgot-password link", async ({ page }) => {
  await page.getByRole("link", { name: /forgot/i }).click();
});
