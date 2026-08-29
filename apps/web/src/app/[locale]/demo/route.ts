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

  const signIn = () =>
    fetch(`${apiBase}/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

  let res = await signIn();

  // Everyone entering the demo signs in as the SAME account, so a handful of
  // prospects arriving together trips the auth rate limiter — which is correct
  // behaviour for a real account and wrong for this one. One short retry
  // absorbs the burst; a visitor who still cannot get in is told so plainly
  // rather than bounced to a sign-in page they have no credentials for.
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await signIn();
  }

  if (!res.ok) {
    // Never echo the upstream body: it can carry auth detail, and the visitor
    // can do nothing with it either way.
    console.error(`[demo] sign-in failed: ${res.status}`);
    if (res.status === 429) {
      return new NextResponse(
        "The demo is busy right now. Please try again in a moment.",
        { status: 503, headers: { "retry-after": "5" } },
      );
    }
    return relativeRedirect(`/${locale}/sign-in`);
  }

  // Land on the all-budgets overview, NOT the app home.
  //
  // Home auto-opens the last-used budget with a client-side soft nav, which
  // unmounts the welcome dialog out from under the visitor — the dialog would
  // appear and then vanish mid-click. The aggregate route is stable, and it is
  // the better first screen anyway: it shows both demo budgets and totals a USD
  // budget against a PLN one, which is the multi-currency story.
  const redirect = relativeRedirect(`/${locale}/budgets/aggregate`);

  // Forward every Set-Cookie the auth service issued, unchanged.
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    redirect.headers.append("set-cookie", cookie);
  }

  return redirect;
}
