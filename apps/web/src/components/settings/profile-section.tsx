"use client";

/**
 * profile-section.tsx — User-pill "Profile" section.
 *
 * PLACEHOLDER (Plan 10-02): the real body — edit name (authClient.updateUser) and
 * email (authClient.changeEmail) with email_hash recompute — lands in Plan 10-03,
 * which OVERWRITES this file. The shell (user-pill.tsx) mounts it as the
 * default-open accordion slot so 10-02 compiles + renders the section structure.
 */
import { useTranslations } from "next-intl";

export function ProfileSection() {
  const t = useTranslations("settings.profile");
  return (
    <p className="text-sm text-[var(--muted-foreground)]">
      {t("placeholder", { defaultValue: "Profile settings coming soon." })}
    </p>
  );
}
