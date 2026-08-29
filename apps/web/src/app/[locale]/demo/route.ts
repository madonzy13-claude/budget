/**
 * /[locale]/demo — one-click entry to the shared demo account.
 *
 * A ROUTE HANDLER, not a page, and deliberately so: it signs in server-side and
 * forwards the resulting session cookie. The demo credentials are read from
 * server-only env and never reach the client bundle, so "view source" does not
 * hand anyone the password to an account that lives in the same database as
 * real households.
 *
 * If the demo is not configured, this is a plain 404 rather than an error — an
 * unconfigured deployment should look like the feature does not exist.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A RELATIVE Location header, resolved by the browser against the address it
 * actually typed.
 *
 * `NextResponse.redirect(new URL(path, req.url))` looks right and is wrong
 * here: behind the tunnel, `req.url` is the container's internal bind address,
 * so the visitor was sent to `https://0.0.0.0:3000/en/budgets`. Deriving the
 * public origin from forwarded headers would work too, but a relative redirect
 * needs no origin at all and cannot be misconfigured.
 */
function relativeRedirect(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { location: path } });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;

  const email = process.env["DEMO_EMAIL"];
  const password = process.env["DEMO_PASSWORD"];
  if (!email || !password) {
    return new NextResponse("Not found", { status: 404 });
  }

  const apiBase = process.env["API_INTERNAL_URL"] ?? "http://api:4000";

  const res = await fetch(`${apiBase}/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    // Never echo the upstream body: it can carry auth detail, and the visitor
    // can do nothing with it either way.
    console.error(`[demo] sign-in failed: ${res.status}`);
    return relativeRedirect(`/${locale}/sign-in`);
  }

  // Land on the app home, which is the app's own landing behaviour (it opens
  // the last-used budget client-side). `/[locale]/budgets` is NOT a route —
  // verified as a live 404, which is how the first version of this shipped.
  const redirect = relativeRedirect(`/${locale}`);

  // Forward every Set-Cookie the auth service issued, unchanged.
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    redirect.headers.append("set-cookie", cookie);
  }

  return redirect;
}
