import { NextResponse } from "next/server";

/**
 * Health probe — used by Docker Compose healthcheck.
 * Returns 200 with {status:'ok', commit} so compose can verify the web container
 * is serving traffic before marking the service as healthy.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    commit: process.env["GIT_COMMIT"] ?? "dev",
    service: "budget-web",
  });
}
