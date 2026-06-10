"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
import { signUp } from "@/lib/auth-client";

interface SignUpFormProps {
  defaultLocale: string;
}

export function SignUpForm({ defaultLocale }: SignUpFormProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const signUpSchema = z.object({
    name: z.string().min(1, t("validation.name_required")),
    email: z.string().email(t("validation.email_invalid")),
    password: z.string().min(8, t("validation.password_min_length")),
    locale: z.string(),
  });

  type SignUpValues = z.infer<typeof signUpSchema>;

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      locale: defaultLocale,
    },
    mode: "onBlur",
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: SignUpValues) {
    setServerError(null);
    const result = await signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
      // additionalFields on user — drives email locale and UI default
      locale: values.locale,
    } as Parameters<typeof signUp.email>[0]);

    if (result.error) {
      const errAsRecord = result.error as unknown as Record<string, unknown>;
      const code = typeof errAsRecord.code === "string" ? errAsRecord.code : "";
      const message = (result.error.message ?? "").toLowerCase();
      const isDuplicate =
        code === "USER_ALREADY_EXISTS" ||
        code === "FAILED_TO_CREATE_USER" ||
        message.includes("already exists") ||
        message.includes("failed to create user");
      setServerError(
        isDuplicate
          ? t("signup.error_email_in_use")
          : (result.error.message ?? t("signup.error_generic")),
      );
      return;
    }

    // Email verification is required before sign-in (autoSignIn disabled).
    // Land the user on /sign-in with a "check your inbox" banner.
    router.push(`/${values.locale}/sign-in?verify=pending`);
    router.refresh();
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name.label")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("name.placeholder")}
                  autoComplete="name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("signup_loading")}
            </>
          ) : (
            t("signup.cta")
          )}
        </Button>
      </form>
    </Form>
  );
}
