"use client";

/**
 * demo-welcome-dialog.tsx — first-paint explanation + language picker.
 *
 * The one thing that makes this different from the settings language control:
 * the demo account is SHARED. Persisting a language choice to the user row
 * would make the first visitor's pick everyone's. So this writes ONLY the
 * locale cookie and a local "seen" flag, and never calls the settings API.
 *
 * See `LocaleSelect` for the account-persisting version used by real users.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "budget-demo-welcome-seen";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pl", label: "Polski" },
  { code: "uk", label: "Українська" },
] as const;

/** localStorage throws in some privacy modes; the dialog must still work. */
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* a viewer who blocks storage simply sees the dialog again */
  }
}

export function DemoWelcomeDialog({ isDemo }: { isDemo: boolean }) {
  const t = useTranslations("demo");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isDemo) return;
    // Read in an effect, not during render: localStorage is per-browser and
    // would otherwise differ between the server render and the client one.
    if (safeGet(SEEN_KEY) === "1") return;
    setOpen(true);
  }, [isDemo]);

  if (!isDemo) return null;

  const dismiss = () => {
    safeSet(SEEN_KEY, "1");
    setOpen(false);
  };

  const choose = (code: string) => {
    safeSet(SEEN_KEY, "1");
    // Cookie only. NOT the settings API — see the file header.
    document.cookie = `budget-locale=${code}; path=/; max-age=31536000; samesite=lax`;
    const next = pathname.replace(/^\/(en|pl|uk)/, `/${code}`) || `/${code}`;
    // Full navigation: a same-path locale swap is a different [locale] RSC
    // segment, and the soft version races (see LocaleSelect's note).
    window.location.assign(next);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent
        className="max-w-sm"
        // Radix restores focus to the trigger on close, which trips
        // :focus-visible rings on a dialog that had no trigger.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("welcome_title")}</DialogTitle>
          <DialogDescription>{t("welcome_body")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">
            {t("choose_language")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGES.map((l) => (
              <Button
                key={l.code}
                variant="outline"
                onClick={() => choose(l.code)}
                data-testid={`demo-lang-${l.code}`}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </div>

        <Button onClick={dismiss} data-testid="demo-welcome-start">
          {t("start")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
