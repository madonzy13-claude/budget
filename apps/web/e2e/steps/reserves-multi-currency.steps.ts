import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { ReservesPo } from "../page-objects/ReservesPo";

const { Given, Then } = createBdd(test);

Given(
  "the {string} reserve is set to {float}",
  async ({ freshUser }, category: string, amount: number) => {
    const { baseUrl, cookieHeader, budgetId } = freshUser;
    const headers = { "content-type": "application/json", cookie: cookieHeader, Origin: baseUrl, "X-Budget-ID": budgetId };
    const list = await fetch(`${baseUrl}/api/budgets/${budgetId}/categories`, { headers });
    const { categories } = (await list.json()) as { categories: { id: string; name: string }[] };
    const cat = categories.find((c) => c.name === category);
    if (!cat) throw new Error(`no category ${category}`);
    const res = await fetch(`${baseUrl}/api/budgets/${budgetId}/reserves/${cat.id}/adjust`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ expectedCents: Math.round(amount * 100) }),
    });
    if (!res.ok) throw new Error(`adjust ${res.status}: ${await res.text()}`);
  },
);

Then("the reserves total needed reads {string}", async ({ page }, text: string) => {
  await new ReservesPo(page).assertTotal("needed", text);
});

Then("the reserves total held reads {string}", async ({ page }, text: string) => {
  await new ReservesPo(page).assertTotal("held", text);
});
