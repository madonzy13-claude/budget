import { NextResponse } from "next/server";

/**
 * The build this server is serving NOW. The app compares it with the build it
 * was loaded from (lib/app-update.ts) to know it is stale. Never cached: the
 * service worker leaves it alone (no matching route) and no-store keeps the
 * browser and any proxy from answering with an old id.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      buildId: process.env["NEXT_PUBLIC_BUILD_ID"] ?? "dev",
      version: process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.0.0",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
