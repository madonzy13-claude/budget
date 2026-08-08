/** Throwaway: the Kids row from the live reserve-fit read model. */
import { execFileSync } from "node:child_process";
import { test } from "./fixtures/fresh-user-per-scenario";

const SRC = "d30ee8ca-a44f-493b-af60-0f9cbd9199f8"; // Private Budget
const SQL =
  "/tmp/claude-1000/-home-claude-budget/569f5e47-1806-481f-bcbc-745919ea07c4/scratchpad/clone-tenant.sql";

test("kids row", async ({ freshUser }) => {
  execFileSync(
    "bash",
    [
      "-c",
      `docker compose exec -T db psql -U postgres -d budget -v src=${SRC} -v dst=${freshUser.budgetId} -f /dev/stdin < ${SQL} >/dev/null 2>&1`,
    ],
    { cwd: "/home/claude/budget" },
  );
  const res = await fetch(
    `${freshUser.baseUrl}/api/budgets/${freshUser.budgetId}/overview/reserve-fit?from=2025-09-01&to=2026-08-31`,
    {
      headers: {
        cookie: freshUser.cookieHeader,
        Origin: freshUser.baseUrl,
        "X-Budget-ID": freshUser.budgetId,
      },
    },
  );
  const body = (await res.json()) as {
    rows?: {
      name: string;
      held_cents: string;
      needed_cents: string;
      gap_cents: string;
      suggested_limit_cents: string | null;
      suggested_delta_cents: string | null;
    }[];
  };
  for (const r of body.rows ?? []) {
    if (!["Kids", "Car", "Travel"].includes(r.name)) continue;
    console.log(
      `${r.name}: held=${r.held_cents} needed=${r.needed_cents} gap=${r.gap_cents} suggested=${r.suggested_limit_cents} delta=${r.suggested_delta_cents}`,
    );
  }
});
