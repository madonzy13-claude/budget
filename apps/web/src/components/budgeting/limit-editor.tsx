"use client";

/**
 * limit-editor.tsx — Form to set/update a category budget limit.
 * Per UI-SPEC §BudgetLimits: normal amount, cushion amount, effectiveFrom date, currency.
 * Defaults effectiveFrom to first of current month.
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
import { CurrencyPicker } from "@/components/common/currency-picker";

interface LimitDto {
  id: string;
  categoryId: string;
  normalAmount: string;
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface LimitEditorProps {
  categoryId: string;
  /** Pre-fill form with existing limit values. */
  existingLimit?: LimitDto | null;
  onSuccess?: (limit: LimitDto) => void;
  onCancel?: () => void;
  apiBase?: string;
}

function firstOfCurrentMonth(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

const formSchema = z.object({
  normalAmount: z.string().min(1),
  cushionAmount: z.string().min(1),
  currency: z.string().length(3),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type FormValues = z.infer<typeof formSchema>;

export function LimitEditor({
  categoryId,
  existingLimit,
  onSuccess,
  onCancel,
  apiBase = "/api",
}: LimitEditorProps) {
  const t = useTranslations("budgeting_categories.limits");
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      normalAmount: existingLimit?.normalAmount ?? "",
      cushionAmount: existingLimit?.cushionAmount ?? "",
      currency: existingLimit?.normalCurrency ?? "EUR",
      effectiveFrom: existingLimit?.effectiveFrom ?? firstOfCurrentMonth(),
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await fetch(`${apiBase}/categories/${categoryId}/limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          normalAmount: values.normalAmount,
          normalCurrency: values.currency,
          cushionAmount: values.cushionAmount,
          cushionCurrency: values.currency,
          effectiveFrom: values.effectiveFrom,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setServerError(err?.message ?? "Failed to save limit.");
        return;
      }

      const saved: LimitDto = await res.json();
      toast.success("Budget limit saved.");
      onSuccess?.(saved);
    } catch {
      setServerError("Network error. Try again.");
    }
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
          name="normalAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("normalAmount")}</FormLabel>
              <FormControl>
                <Input type="number" min="0" step="1" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cushionAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("cushionAmount")}</FormLabel>
              <FormControl>
                <Input type="number" min="0" step="1" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("currency")}</FormLabel>
              <FormControl>
                <CurrencyPicker
                  value={field.value}
                  onSelect={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="effectiveFrom"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("effectiveFrom")}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
