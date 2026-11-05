"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ConsentFormProps {
  clientId: string;
  /** The space-separated scope the client asked for — granted as-is or not at all. */
  scope: string;
  /** The signed query the provider put on this page; it carries the request. */
  query: string;
}

interface ClientInfo {
  client_name: string | null;
  redirect_hosts: string[];
}

/**
 * Consent for an MCP client (Phase 15). All-or-nothing over every budget
 * (D-01, D-02). Submitted with fetch, not a native form: CSP form-action 'self'
 * would block the provider's 302 to the client's redirect_uri.
 */
export function ConsentForm({ clientId, scope, query }: ConsentFormProps) {
  const t = useTranslations("oauthConsent");
  const [client, setClient] = useState<ClientInfo | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const scopes = scope.split(" ");

  useEffect(() => {
    let live = true;
    fetch(`/api/settings/connected-apps/client/${encodeURIComponent(clientId)}`, {
      credentials: "include",
    })
      .then(async (r) => (r.ok ? ((await r.json()) as ClientInfo) : "missing"))
      .catch(() => "missing" as const)
      .then((c) => live && setClient(c));
    return () => {
      live = false;
    };
  }, [clientId]);

  async function decide(accept: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch("/auth/oauth2/consent", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, scope, oauth_query: query }),
      });
      const body = (await r.json()) as { url?: string };
      if (!r.ok || !body.url) throw new Error("consent_failed");
      window.location.assign(body.url);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  if (client === null)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin" aria-label={t("loading")} />
      </div>
    );

  if (client === "missing")
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("unknownClient")}</AlertDescription>
      </Alert>
    );

  const name = client.client_name ?? clientId;
  return (
    <div className="space-y-5">
      <h1 className="text-display-sm">{t("title", { client: name })}</h1>
      {client.redirect_hosts.length > 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("redirectsTo", { host: client.redirect_hosts.join(", ") })}
        </p>
      )}
      <ul className="space-y-2 text-sm">
        <li>{t("allBudgets")}</li>
        {scopes.includes("read") && <li>{t("read")}</li>}
        {scopes.includes("write") && <li>{t("write")}</li>}
      </ul>
      <p className="text-sm text-[var(--muted-foreground)]">{t("revokeHint")}</p>
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t("failed")}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={() => decide(false)}
        >
          {t("deny")}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy}
          onClick={() => decide(true)}
        >
          {t("allow")}
        </Button>
      </div>
    </div>
  );
}
