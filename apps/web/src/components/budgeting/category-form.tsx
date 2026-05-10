"use client";

/**
 * category-form.tsx — RHF form for creating a new category.
 * Per UI-SPEC §Categories: name, scope, optional parent group.
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

interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  scope: string;
  archivedAt: string | null;
}

interface CategoryFormProps {
  /** Existing root categories available as parents. */
  rootCategories?: CategoryDto[];
  onSuccess?: (category: CategoryDto) => void;
  onCancel?: () => void;
  apiBase?: string;
}

const formSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(["PERSONAL", "SHARED"]),
  parentId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CategoryForm({
  rootCategories = [],
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
      scope: "SHARED",
      parentId: undefined,
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const body: Record<string, unknown> = {
        name: values.name,
        scope: values.scope,
      };
      if (values.parentId) {
        body.parentId = values.parentId;
      }

      const res = await fetch(`${apiBase}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setServerError(err?.message ?? "Failed to create category.");
        return;
      }

      const created: CategoryDto = await res.json();
      toast.success(`Category "${created.name}" created.`);
      form.reset();
      onSuccess?.(created);
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.name")}</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Housing" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="scope"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.scope")}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PERSONAL">{t("scopes.PERSONAL")}</SelectItem>
                  <SelectItem value="SHARED">{t("scopes.SHARED")}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {rootCategories.length > 0 && (
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.parent")}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="None (root category)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {rootCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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
