import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dispatch } from "../dispatch";
import { readTool, toolOk, fromDispatch, untrusted, type McpCtx } from "./define";

/** Read tools — each a thin dispatch over the route the web app uses. */
export function registerReadTools(server: McpServer, ctx: McpCtx): void {
  readTool(
    server,
    ctx,
    "list_budgets",
    {
      description:
        "List every budget the user can access, with its currency and the user's role. Call this first: every other tool takes a budget_id.",
      inputSchema: z.object({}),
    },
    async (_args, c) => {
      const r = await dispatch(c.app, c.who, { method: "GET", path: "/budgets/active" });
      if (!r.ok) return fromDispatch(r);
      const budgets = (
        r.body as {
          budgets: Array<{
            id: string;
            name: string;
            default_currency: string;
            ownerUserId: string;
          }>;
        }
      ).budgets;
      return toolOk({
        budgets: budgets.map((b) => ({
          budget_id: b.id,
          name: untrusted(b.name),
          currency: b.default_currency,
          role: b.ownerUserId === c.who.userId ? "owner" : "member",
        })),
      });
    },
  );
}
