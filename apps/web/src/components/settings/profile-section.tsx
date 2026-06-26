"use client";

/**
 * profile-section.tsx — User-pill "Profile" section (CONTEXT decision 4, USET-04).
 *
 * Edit the account NAME (authClient.updateUser({ name })) and EMAIL
 * (authClient.changeEmail({ newEmail }) → confirm link to the OLD address, then
 * re-verify the NEW one; email stays pending until clicked). Reads the current
 * user from authClient.useSession so it needs no props (mounts into the 10-02
 * accordion slot as <ProfileSection />). Mirrors sessions-list.tsx for the
 * authClient + toast idiom.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";

export function ProfileSection() {
  const t = useTranslations("settings.profile");
  const locale = useLocale();
  const { data: session } = authClient.useSession();
  const user = session?.user as
    | { name?: string; email?: string; emailVerified?: boolean }
    | undefined;

  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const nameValue = nameEdit ?? user?.name ?? "";

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      const res = await authClient.updateUser({ name: nameValue });
      if ((res as { error?: unknown } | undefined)?.error) throw new Error();
      toast.success(t("name.saved"));
      setNameEdit(null);
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
        callbackURL: `/${locale}/settings/user`,
      });
      if ((res as { error?: unknown } | undefined)?.error) throw new Error();
      toast.success(t("email.sent"));
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
          <span>{user?.email ?? ""}</span>
          {user && user.emailVerified === false && (
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
      </div>
    </div>
  );
}
