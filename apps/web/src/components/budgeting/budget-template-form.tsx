"use client";

/**
 * budget-template-form.tsx — Form to apply a budget template to a target month.
 * Per UI-SPEC §BudgetTemplates.
 */
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

interface TemplateDto {
  id: string;
  name: string;
}

interface BudgetTemplateFormProps {
  templates: TemplateDto[];
  onSuccess?: () => void;
  // clientApiWrite prefixes /api itself, so this prop is no longer consumed;
  // kept (underscore-prefixed) for call-site/test compatibility.
  _apiBase?: string;
}

function currentMonthDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

const formSchema = z.object({
  templateId: z.string().min(1),
  targetMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type FormValues = z.infer<typeof formSchema>;

export function BudgetTemplateForm({
  templates,
  onSuccess,
  _apiBase = "/api",
}: BudgetTemplateFormProps) {
  const t = useTranslations("budgeting_categories.templates");
  const offlineToast = useOfflineWriteToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      templateId: templates[0]?.id ?? "",
      targetMonth: currentMonthDate(),
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await clientApiWrite(
        `/budget-templates/${values.templateId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ targetMonth: values.targetMonth }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setServerError(err?.message ?? t("errors.applyFailed"));
        return;
      }
      toast.success(t("toast.applied"));
      onSuccess?.();
    } catch (err) {
      // Honest-offline: device offline / unreachable / hung / 5xx → shared toast.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      setServerError(t("errors.network"));
    }
  }

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="templateId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("title")}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="targetMonth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("targetMonth")}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("applyButton")}
        </Button>
      </form>
    </Form>
  );
}
