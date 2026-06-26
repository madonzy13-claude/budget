"use client";

/**
 * security-section.tsx — User-pill "Security" section.
 *
 * PLACEHOLDER (Plan 10-02): the real body — email-gated password change (reuse
 * reset flow), active-sessions list + revoke, and sign-out-other-devices
 * (revokeOtherSessions) — lands in Plan 10-04, which OVERWRITES this file. The
 * shell mounts it so 10-02 compiles + renders the accordion structure.
 */
import { useTranslations } from "next-intl";

export function SecuritySection() {
  const t = useTranslations("settings.security");
  return (
    <p className="text-sm text-[var(--muted-foreground)]">
      {t("placeholder", { defaultValue: "Security settings coming soon." })}
    </p>
  );
}
