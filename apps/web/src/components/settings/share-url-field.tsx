"use client";

/**
 * share-url-field.tsx — D-14
 *
 * Ephemeral share URL field — held in component state only.
 * Gone on reload. No outstanding-links list.
 * Copy button: yellow icon only (accent discipline).
 * Catch branch MUST call toast.error for clipboard permission failures.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";

/** Fallback clipboard copy for non-secure contexts (plain http). Returns
 *  true on success. Uses an off-screen textarea + execCommand("copy"),
 *  which is the only path that works without HTTPS. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export interface ShareUrlFieldProps {
  budgetId: string;
}

export function ShareUrlField({ budgetId }: ShareUrlFieldProps) {
  const t = useTranslations("share");
  const [url, setUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.budgets[":id"].share.$post({
        param: { id: budgetId },
        json: { ttlDays: 7 },
      });
      if (!res.ok) throw new Error("Failed to generate link");
      const body = (await res.json()) as { url: string };
      setUrl(body.url);
    } catch {
      toast.error(t("generate_failed"));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    // Try the modern Clipboard API first — only available in secure
    // contexts (HTTPS or localhost). When the app is served from a plain
    // HTTP origin (Tailscale, IP, intranet) navigator.clipboard is either
    // undefined or its writeText rejects; fall back to a temporary
    // selection + document.execCommand('copy'), which works across all
    // browsers regardless of secure-context status.
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
        toast.success(t("copied"));
        return;
      }
      throw new Error("clipboard-unavailable");
    } catch {
      if (legacyCopy(url)) {
        toast.success(t("copied"));
      } else {
        toast.error(t("copy_failed"));
      }
    }
  };

  if (!url) {
    return (
      <Button
        variant="outline"
        className="border-[var(--hairline-on-dark)] text-[var(--body)]"
        onClick={generate}
        disabled={generating}
      >
        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t("generate_button")}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--body)]">
        {t("field_label")}
      </p>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={url}
          data-testid="share-url-field"
          className="flex-1 cursor-text bg-[var(--surface-elevated-dark)] text-sm text-[var(--body)]"
        />
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] text-[var(--primary)] hover:bg-[var(--primary)]/10"
          onClick={copy}
          aria-label={t("copy_aria")}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        {t("expires_in_7_days")}
      </p>
    </div>
  );
}
