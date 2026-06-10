"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { signIn } from "@/lib/auth-client";

interface SignInFormProps {
  locale: string;
}

export function SignInForm({ locale }: SignInFormProps) {
  const t = useTranslations("auth");
  const [serverError, setServerError] = useState<string | null>(null);

  const signInSchema = z.object({
    email: z.string().email(t("validation.email_invalid")),
    password: z.string().min(1, t("validation.password_required")),
  });

  type SignInValues = z.infer<typeof signInSchema>;

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: SignInValues) {
    setServerError(null);
    const result = await signIn.email({
      email: values.email,
      password: values.password,
    });

    if (result.error) {
      const errAsRecord = result.error as unknown as Record<string, unknown>;
      const code = typeof errAsRecord.code === "string" ? errAsRecord.code : "";
      const message = (result.error.message ?? "").toLowerCase();
      const isUnverified =
        code === "EMAIL_NOT_VERIFIED" ||
        message.includes("email not verified") ||
        message.includes("verify your email");
      const isInvalidCreds =
        code === "INVALID_EMAIL_OR_PASSWORD" ||
        code === "INVALID_CREDENTIALS" ||
        message.includes("invalid email or password") ||
        message.includes("invalid credentials");
      let next: string;
      if (isUnverified) next = t("signin.error_email_not_verified");
      else if (isInvalidCreds) next = t("signin.error_invalid_credentials");
      else next = result.error.message ?? t("signin.error_generic");
      setServerError(next);
      return;
    }

    // The account locale is authoritative for logged-in users. Persist it to
    // the `budget-locale` cookie so middleware can keep the URL locale in sync,
    // and land the user directly on their locale's home.
    const accountLocale = (result.data as { user?: { locale?: string } } | null)
      ?.user?.locale;
    const targetLocale = accountLocale ?? locale;
    if (accountLocale) {
      document.cookie = `budget-locale=${accountLocale}; path=/; max-age=31536000; samesite=lax`;
    }
    // Hard navigation (not router.push) so the new session cookie is
    // applied on a fresh document load. router.push triggers a Next.js
    // client-side RSC fetch that races the just-set cookie; when the
    // destination layout server-redirects (e.g. the (app) onboarding
    // guard pushing the user to /budgets/new?step=1), the chained RSC
    // stream lands as an empty document — a blank page that only
    // recovers after a manual reload.
    window.location.href = `/${targetLocale}`;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
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
                  placeholder={t("email.placeholder")}
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("password.label")}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("loading")}
            </>
          ) : (
            t("signin.cta")
          )}
        </Button>
      </form>
    </Form>
  );
}
