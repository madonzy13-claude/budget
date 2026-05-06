/**
 * settings.ts — /settings route factory
 * User settings: locale, display_currency, provider_prefs, sessions.
 *
 * PC-02: uses deps.identity.userRepo + deps.identity.auth from factory output.
 * T-01-07-06: zValidator on every state-changing endpoint.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";
import { UserId } from "@budget/shared-kernel";
import type { Locale, LLMProviderName, STTProviderName } from "@budget/identity";

export function settingsRoutesFactory(deps: BootedDeps) {
  const r = new Hono();

  const localeSchema = z.object({
    locale: z.enum(["en", "pl", "uk"]),
  });

  const currencySchema = z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
  });

  const providerPrefsSchema = z.object({
    llm: z.enum(["claude_haiku", "groq"]).nullable().optional(),
    stt: z.enum(["browser", "groq"]).nullable().optional(),
  });

  // PUT /settings/locale — update user locale
  r.put("/locale", zValidator("json", localeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    try {
      await deps.identity.userRepo.updateLocale(
        UserId(session.user.id),
        body.locale as Locale,
      );
      return c.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/Invalid locale/.test(msg)) return c.json({ error: msg }, 400);
      throw e;
    }
  });

  // PUT /settings/display-currency — update display currency
  r.put("/display-currency", zValidator("json", currencySchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    try {
      await deps.identity.userRepo.updateDisplayCurrency(
        UserId(session.user.id),
        body.currency,
      );
      return c.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/Invalid ISO-4217/.test(msg)) return c.json({ error: msg }, 400);
      throw e;
    }
  });

  // PUT /settings/provider-prefs — update LLM/STT provider preferences
  r.put("/provider-prefs", zValidator("json", providerPrefsSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    const prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null } = {};
    if (body.llm !== undefined) prefs.llm = body.llm as LLMProviderName | null;
    if (body.stt !== undefined) prefs.stt = body.stt as STTProviderName | null;
    await deps.identity.userRepo.updateProviderPrefs(UserId(session.user.id), prefs);
    return c.json({ ok: true });
  });

  // GET /settings/sessions — list active sessions
  r.get("/sessions", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    // Better Auth sessions are managed via auth API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = deps.identity.auth as any;
    try {
      const sessions = await auth.api.listSessions({
        headers: c.req.raw.headers,
      });
      return c.json({ sessions: sessions ?? [] });
    } catch {
      return c.json({ sessions: [] });
    }
  });

  // DELETE /settings/sessions/:id — revoke session
  r.delete("/sessions/:id", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: sessionId } = c.req.param();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = deps.identity.auth as any;
    try {
      await auth.api.revokeSession({
        body: { sessionId },
        headers: c.req.raw.headers,
      });
      return c.json({ ok: true });
    } catch (e) {
      throw e;
    }
  });

  return r;
}
