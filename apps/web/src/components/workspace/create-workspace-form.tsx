"use client";

import { useState } from "react";
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

// Workspace kind — PRIVATE is the default (D-03)
type WorkspaceKind = "PRIVATE" | "SHARED";

const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required.").max(100),
  kind: z.enum(["PRIVATE", "SHARED"]),
  default_currency: z.string().min(3, "Default currency is required.").max(3),
});

type CreateWorkspaceValues = z.infer<typeof createWorkspaceSchema>;

interface CreateWorkspaceFormProps {
  locale?: string;
  onSuccess?: (workspaceId: string) => void;
}

export function CreateWorkspaceForm({
  locale: _locale,
  onSuccess,
}: CreateWorkspaceFormProps) {
  const t = useTranslations();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateWorkspaceValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: "",
      kind: "PRIVATE", // PRIVATE is preselected per plan requirement
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
          kind: values.kind,
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
      toast.success(t("workspaces.create.success", { name: created.name }));
      onSuccess?.(created.id);
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
              <FormLabel>{t("workspaces.create.name.label")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("workspaces.create.name.placeholder")}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Kind selector — PRIVATE | SHARED radio group */}
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("workspaces.create.kind.label")}</FormLabel>
              <FormControl>
                <div className="flex flex-col gap-2" role="radiogroup">
                  {(["PRIVATE", "SHARED"] as WorkspaceKind[]).map((kind) => (
                    <label
                      key={kind}
                      className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
                    >
                      <input
                        type="radio"
                        value={kind}
                        checked={field.value === kind}
                        onChange={() => field.onChange(kind)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm font-medium">
                        {kind === "PRIVATE"
                          ? t("workspaces.create.kind.private")
                          : t("workspaces.create.kind.shared")}
                      </span>
                    </label>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Default currency — permanent, immutable after creation */}
        <FormField
          control={form.control}
          name="default_currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("workspaces.create.currency.label")}</FormLabel>
              <FormControl>
                <CurrencyPicker
                  value={field.value}
                  onSelect={field.onChange}
                  placeholder={t("workspaces.create.currency.placeholder")}
                  aria-label={t("workspaces.create.currency.label")}
                />
              </FormControl>
              {/* Permanent helper — reinforces immutability at UX layer */}
              <FormDescription className="text-sm text-muted-foreground">
                {t("workspaces.create.currency.helper")}
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
            t("workspaces.create.cta")
          )}
        </Button>
      </form>
    </Form>
  );
}
