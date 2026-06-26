"use client";

/**
 * account-danger-zone.tsx — User-pill "Danger Zone" section.
 *
 * PLACEHOLDER (Plan 10-02): the real body — permanent account deletion (GDPR
 * right-to-delete) behind a typed confirmation, via Better Auth deleteUser +
 * cascade purge — lands in Plan 10-06, which OVERWRITES this file. The shell
 * mounts it so 10-02 compiles + renders the accordion structure.
 */
import { useTranslations } from "next-intl";

export function AccountDangerZone() {
  const t = useTranslations("settings.accountDanger");
  return (
    <p className="text-sm text-[var(--muted-foreground)]">
      {t("placeholder", { defaultValue: "Account deletion coming soon." })}
    </p>
  );
}
