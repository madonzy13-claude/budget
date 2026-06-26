import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
const { When, Then } = createBdd(test);

function mailpitBaseUrl(): string {
  return process.env.MAILPIT_URL ?? "http://localhost:8025";
}

// Poll mailpit for the delete-account confirmation email and return the full
// confirm URL (Better Auth's /auth/delete-user/callback?token=...).
async function fetchDeleteUrl(email: string): Promise<string> {
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
        m.Subject.toLowerCase().includes("delet"),
    );
    if (msg) {
      const detail = (await fetch(`${mailpit}/api/v1/message/${msg.ID}`).then(
        (r) => r.json(),
      )) as { HTML?: string; Text?: string };
      const body = detail.HTML ?? detail.Text ?? "";
      const m =
        body.match(/https?:\/\/[^\s"'<>]*delete-user[^\s"'<>]*/) ??
        body.match(/https?:\/\/[^\s"'<>]*token=[^\s"'<>]+/);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`mailpit delete-account email never arrived for ${email}`);
}

When("I open the Danger Zone", async ({ page }) => {
  await page.goto("/en/settings/user");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  await page.getByRole("button", { name: "Danger Zone" }).click();
  await page
    .getByTestId("delete-account-open")
    .waitFor({ state: "visible", timeout: 10000 });
});

When("I confirm account deletion by typing DELETE", async ({ page }) => {
  await page.getByTestId("delete-account-open").click();
  await page.getByRole("alertdialog").waitFor({ state: "visible" });
  await page.getByTestId("delete-confirm-input").fill("DELETE");
  await page.getByTestId("delete-account-confirm").click();
});

When(
  "I open the account-deletion link from my email",
  async ({ page, freshUser }) => {
    const url = await fetchDeleteUrl(freshUser.email);
    await page.goto(url);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

Then(
  "I cannot sign in with my old account",
  async ({ page, freshUser, baseURL }) => {
    const base =
      baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    // Give the cascade a beat to finish, then confirm the credentials are dead.
    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${base}/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", Origin: base },
        body: JSON.stringify({
          email: freshUser.email,
          password: freshUser.password,
        }),
      });
      lastStatus = res.status;
      if (!res.ok) return; // account gone → sign-in rejected
      await page.waitForTimeout(500);
    }
    throw new Error(
      `expected sign-in to fail after deletion, but it kept succeeding (last status ${lastStatus})`,
    );
  },
);
