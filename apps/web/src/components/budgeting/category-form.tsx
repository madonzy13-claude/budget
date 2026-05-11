"use client";

/**
 * category-form.tsx — RHF form for creating a new category.
 * Categories are flat (no nesting) and unique per workspace by name.
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

interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  scope: string;
  archivedAt: string | null;
}

interface CategoryFormProps {
  onSuccess?: (category: CategoryDto) => void;
  onCancel?: () => void;
  apiBase?: string;
}

const formSchema = z.object({
  name: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

export function CategoryForm({
  onSuccess,
  onCancel,
  apiBase = "/api",
}: CategoryFormProps) {
  const t = useTranslations("budgeting_categories.categories");
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await fetch(`${apiBase}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: values.name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // 409 from API when a category with this name already exists in workspace.
        const code = err?.error ?? err?.message;
        if (res.status === 409 || code === "category_name_taken") {
          setServerError(t("form.errors.nameTaken"));
          return;
        }
        setServerError(err?.message ?? t("form.errors.generic"));
        return;
      }

      const created: CategoryDto = await res.json();
      toast.success(`Category "${created.name}" created.`);
      form.reset();
      onSuccess?.(created);
    } catch {
      setServerError(t("form.errors.network"));
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.name")}</FormLabel>
              <FormControl>
                <Input placeholder={t("form.namePlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("form.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("form.save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
