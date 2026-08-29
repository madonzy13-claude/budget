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
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, _req.url));
  }

  // Land on the budget list; the demo account's two budgets are there, which
  // is also the first thing worth showing a prospect.
  const redirect = NextResponse.redirect(
    new URL(`/${locale}/budgets`, _req.url),
  );

  // Forward every Set-Cookie the auth service issued, unchanged.
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    redirect.headers.append("set-cookie", cookie);
  }

  return redirect;
}
