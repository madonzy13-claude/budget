/**
 * oauth-continue.ts — where sign-in goes next when it interrupted an MCP
 * client's OAuth authorize request (Phase 15).
 *
 * The provider sends the user to /sign-in with the signed authorize query.
 * After sign-in we go back to OUR authorize endpoint with that query (minus
 * the signature bits) and let the server decide: consent page, or the
 * client's registered redirect_uri. Always a same-origin path, so no URL
 * parameter can turn this into an open redirect.
 */
export function oauthContinueUrl(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.get("client_id") || params.get("response_type") !== "code")
    return null;
  for (const key of [...params.keys()])
    if (key === "sig" || key === "exp" || key.startsWith("ba_"))
      params.delete(key);
  return `/auth/oauth2/authorize?${params}`;
}
