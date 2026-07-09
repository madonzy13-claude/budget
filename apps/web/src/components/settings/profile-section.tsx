"use client";

/**
 * profile-section.tsx — User-pill "Profile" section (CONTEXT decision 4, USET-04).
 *
 * Edit the account NAME (authClient.updateUser({ name })) and EMAIL
 * (authClient.changeEmail({ newEmail }) → confirm link to the OLD address, then
 * re-verify the NEW one; email stays pending until clicked). The current user is
 * SERVER-SEEDED as props (mirrors GeneralPill): the vanilla better-auth/client
 * `useSession` is a nanostore atom, not a React hook, so we thread name/email/
 * emailVerified from the catch-all page's fresh getServerSession instead — no
 * extra dep, no loading flash, SSR-correct. Mirrors sessions-list.tsx for the
 * authClient + toast idiom.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";

export interface ProfileSectionProps {
  name: string;
  email: string;
  emailVerified: boolean;
}

export function ProfileSection({
  name,
  email,
  emailVerified,
}: ProfileSectionProps) {
  const t = useTranslations("settings.profile");
  const locale = useLocale();
  const router = useRouter();

  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailRequested, setEmailRequested] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const nameValue = nameEdit ?? name ?? "";

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      const res = await authClient.updateUser({ name: nameValue });
      if ((res as { error?: unknown } | undefined)?.error) throw new Error();
      toast.success(t("name.saved"));
      // Keep the just-saved value in the field. Resetting to null would fall
      // back to the server-seeded `name` prop, which is stale until the next
      // full reload (fresh getServerSession) — making the input snap back.
      setNameEdit(nameValue);
      // Re-render the server tree so the header profile menu (server-seeded
      // name + avatar initials) reflects the new name without a manual reload.
      // Better Auth's updateUser refreshes the session cookie cache, so the
      // TopNav getServerSession read picks up the new value on refresh.
      router.refresh();
    } catch {
      toast.error(t("error"));
    } finally {
      setSavingName(false);
    }
  };

  const handleChangeEmail = async () => {
    setSavingEmail(true);
    try {
      const res = await authClient.changeEmail({
        newEmail,
        // Better Auth's change-email is two clicks: the OLD-address link confirms
        // and emails a verify link to the NEW address; the NEW-address link
        // applies the change + auto-verifies. Both reuse this callbackURL, so we
        // pass the target as `?to=` — /email-changed compares it to the live
        // session email to tell "still pending" (step 1) from "done" (step 2).
        callbackURL: `/${locale}/email-changed?to=${encodeURIComponent(newEmail)}`,
      });
      if ((res as { error?: unknown } | undefined)?.error) throw new Error();
      toast.success(t("email.sent"));
      setEmailRequested(newEmail);
      setNewEmail("");
    } catch {
      toast.error(t("error"));
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Name */}
      <div className="space-y-2">
        <label
          htmlFor="profile-name"
          className="block text-sm font-medium text-[var(--on-dark)]"
        >
          {t("name.label")}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="profile-name"
            data-testid="profile-name-input"
            value={nameValue}
            onChange={(e) => setNameEdit(e.target.value)}
            autoComplete="name"
          />
          <Button
            data-testid="profile-name-save"
            onClick={handleSaveName}
            disabled={savingName || nameValue.trim().length === 0}
          >
            {t("name.save")}
          </Button>
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <label
          htmlFor="profile-email"
          className="block text-sm font-medium text-[var(--on-dark)]"
        >
          {t("email.label")}
        </label>
        <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <span>{email}</span>
          {emailVerified === false && (
            <Badge variant="secondary" data-testid="profile-email-pending">
              {t("email.pending")}
            </Badge>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="profile-email"
            data-testid="profile-email-input"
            type="email"
            placeholder={t("email.placeholder")}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
          />
          <Button
            data-testid="profile-email-save"
            onClick={handleChangeEmail}
            disabled={savingEmail || newEmail.trim().length === 0}
          >
            {t("email.change")}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {t("email.helper")}
        </p>
        {emailRequested && (
          <div
            data-testid="email-change-pending"
            className="space-y-2 rounded-md border border-[var(--info)]/40 bg-[var(--info)]/10 px-3 py-3 text-sm text-[var(--body-on-dark)]"
          >
            <p className="font-medium text-[var(--on-dark)]">
              {t("email.confirm_title")}
            </p>
            <ol className="list-decimal space-y-1 pl-5 marker:text-[var(--muted-foreground)]">
              <li>
                {t.rich("email.confirm_step1", {
                  current: email,
                  strong: (c) => (
                    <span className="font-medium break-all text-[var(--on-dark)]">
                      {c}
                    </span>
                  ),
                })}
              </li>
              <li>
                {t.rich("email.confirm_step2", {
                  next: emailRequested,
                  strong: (c) => (
                    <span className="font-medium break-all text-[var(--on-dark)]">
                      {c}
                    </span>
                  ),
                })}
              </li>
            </ol>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t("email.confirm_note")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
