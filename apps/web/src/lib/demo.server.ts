import "server-only";

/**
 * demo.server.ts — "is this the shared demo account?", resolved on the server.
 *
 * Deliberately NOT a NEXT_PUBLIC_ variable. Those are baked at image build
 * time, and this repo has already been bitten once by a public env var that was
 * absent from the build (the VAPID key, which silently produced zero push
 * subscriptions). Reading it server-side per request means configuring the demo
 * never requires rebuilding the web image.
 */
export function isDemoSession(session: unknown): boolean {
  const demoUserId = process.env["DEMO_USER_ID"];
  if (!demoUserId) return false;
  const userId = (session as { user?: { id?: string } } | null)?.user?.id;
  return Boolean(userId) && userId === demoUserId;
}
