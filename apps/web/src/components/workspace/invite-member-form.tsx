"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { api } from "@/lib/api-client";

type InviteValues = {
  email: string;
};

interface InviteMemberFormProps {
  workspaceId: string;
}

export function InviteMemberForm({ workspaceId }: InviteMemberFormProps) {
  const t = useTranslations("workspace.invite");
  const tRoot = useTranslations();
  const [serverError, setServerError] = useState<string | null>(null);

  const inviteSchema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("validation.email_invalid")),
      }),
    [t],
  );

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: InviteValues) {
    setServerError(null);
    try {
      const res = await api.workspaces[":id"].invitations.$post({
        param: { id: workspaceId },
        json: { email: values.email },
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
          code?: string;
        };
        if (err.code === "ALREADY_MEMBER") {
          setServerError(t("error.already_member", { email: values.email }));
        } else {
          setServerError(err.message ?? tRoot("state.error.generic"));
        }
        return;
      }

      toast.success(t("success", { email: values.email }));
      form.reset();
    } catch {
      setServerError(tRoot("state.error.network"));
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        <h2 className="text-title-md text-[var(--foreground)]">
          {t("heading")}
        </h2>

        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("email.label")}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="member@example.com"
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {tRoot("state.loading")}
            </>
          ) : (
            t("cta")
          )}
        </Button>
      </form>
    </Form>
  );
}
