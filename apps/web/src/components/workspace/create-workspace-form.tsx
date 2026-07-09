"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { api } from "@/lib/api-client";

type CreateWorkspaceValues = {
  name: string;
  default_currency: string;
};

interface CreateWorkspaceFormProps {
  locale?: string;
  onSuccess?: (workspaceId: string) => void;
}

export function CreateWorkspaceForm({
  locale,
  onSuccess,
}: CreateWorkspaceFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const createWorkspaceSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t("budgets.create.validation.name_required"))
          .max(100),
        default_currency: z
          .string()
          .min(3, t("budgets.create.validation.currency_required"))
          .max(3),
      }),
    [t],
  );

  const form = useForm<CreateWorkspaceValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: "",
      default_currency: "",
    },
    mode: "onBlur",
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: CreateWorkspaceValues) {
    setServerError(null);
    try {
      const res = await api.workspaces.$post({
        json: {
          name: values.name,
          default_currency: values.default_currency,
        },
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setServerError(err.message ?? t("state.error.generic"));
        return;
      }

      const created = (await res.json()) as { id: string; name: string };
      // Workspace context is now URL-driven (/workspaces/[wsId]/...) — no
      // session "active workspace" to set. Land the user directly inside
      // their new workspace on the budget tab.
      toast.success(t("budgets.create.success", { name: created.name }));
      onSuccess?.(created.id);
      router.push(`/${locale ?? "en"}/workspaces/${created.id}/budget`);
    } catch {
      setServerError(t("state.error.network"));
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
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
              <FormLabel>{t("budgets.create.name.label")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("budgets.create.name.placeholder")}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* kind-removal: no budget-type picker — every budget can invite
            members; private/shared is derived from member count for display. */}

        <FormField
          control={form.control}
          name="default_currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgets.create.currency.label")}</FormLabel>
              <FormControl>
                <CurrencyPicker
                  value={field.value}
                  onSelect={field.onChange}
                  placeholder={t("budgets.create.currency.placeholder")}
                  aria-label={t("budgets.create.currency.label")}
                />
              </FormControl>
              <FormDescription>
                {t("budgets.create.currency.helper")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("state.loading")}
            </>
          ) : (
            t("budgets.create.cta")
          )}
        </Button>
      </form>
    </Form>
  );
}
