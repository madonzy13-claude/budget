import type { MiddlewareHandler } from "hono";
import type { Locale } from "@budget/identity";

export const i18nMiddleware: MiddlewareHandler = async (c, next) => {
  const session = c.get("session");
  const locale: Locale =
    (session?.user as { locale?: Locale } | undefined)?.locale ?? "en";
  c.set("locale", locale);
  await next();
};
