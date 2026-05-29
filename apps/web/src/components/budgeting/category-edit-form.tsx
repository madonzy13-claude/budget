"use client";

/**
 * category-edit-form.tsx — Unified create + edit form for a category.
 *
 * Fields:
 *   - name (always required)
 *   - normalAmount, cushionAmount (always shown; written via /limits when non-zero)
 *   - effectiveFrom (EDIT mode only — pre-fills with the existing limit's
 *     effective_from; SCD-2 close-and-insert happens automatically server-side
 *     when the date differs)
 *
 * Currency is NOT shown — it inherits from the active workspace's
 * default_currency. Scope is NOT shown — it inherits from workspace.kind.
 */
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
import { clientApiFetch } from "@/lib/budget-fetch";

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

interface ExistingCategory {
  id: string;
  name: string;
}

export type CategoryEditMode =
  | { kind: "create" }
  | {
      kind: "edit";
      category: ExistingCategory;
      existingLimit: LimitDto | null;
    };

interface CategoryEditFormProps {
  mode: CategoryEditMode;
  onSuccess?: () => void;
  onCancel?: () => void;
  /**
   * Phase 6 onboarding rewrite: when false, the Cushion amount field is
   * hidden entirely from the form. The submit path still posts the
   * default "0" cushion value to /limits, so disabling cushion mid-life
   * does not leave the column with stale non-zero data — but no UI is
   * exposed for editing it. Defaults to true so existing callers keep
   * the field visible.
   */
  cushionEnabled?: boolean;
  _apiBase?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CategoryEditForm({
  mode,
  onSuccess,
  onCancel,
  cushionEnabled = true,
  _apiBase = "/api",
}: CategoryEditFormProps) {
  const tCat = useTranslations("budgeting_categories.categories");
  const tLim = useTranslations("budgeting_categories.limits");
  const [serverError, setServerError] = useState<string | null>(null);

  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.category : null;
  const existingLimit = isEdit ? mode.existingLimit : null;

  const formSchema = useMemo(() => {
    const nonNegInt = tCat("form.errors.nonNegativeInt");
    const base = z.object({
      name: z.string().min(1).max(120),
      normalAmount: z.string().regex(/^\d+$/, nonNegInt),
      cushionAmount: z.string().regex(/^\d+$/, nonNegInt),
    });
    return isEdit
      ? base.extend({
          effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      : base;
  }, [isEdit, tCat]);

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as never,
    defaultValues: {
      name: existing?.name ?? "",
      normalAmount: existingLimit?.normalAmount ?? "0",
      cushionAmount: existingLimit?.cushionAmount ?? "0",
      ...(isEdit
        ? { effectiveFrom: existingLimit?.effectiveFrom ?? todayIso() }
        : {}),
    } as never,
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setServerError(null);

    try {
      let categoryId: string;

      if (mode.kind === "create") {
        // 1. Create the category.
        const res = await clientApiFetch(`/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: values.name }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (res.status === 409 || err.error === "category_name_taken") {
            setServerError(tCat("form.errors.nameTaken"));
            return;
          }
          setServerError(tCat("form.errors.generic"));
          return;
        }
        const created = (await res.json()) as { id: string; name: string };
        categoryId = created.id;
        toast.success(tCat("toast.created", { name: created.name }));
      } else {
        // 2. EDIT: rename only if name changed, then write the limit.
        categoryId = mode.category.id;
        if (values.name !== mode.category.name) {
          const ren = await clientApiFetch(`/categories/${categoryId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: values.name }),
          });
          if (!ren.ok) {
            const err = (await ren.json().catch(() => ({}))) as {
              error?: string;
            };
            if (ren.status === 409 || err.error === "category_name_taken") {
              setServerError(tCat("form.errors.nameTaken"));
              return;
            }
            setServerError(tCat("form.errors.generic"));
            return;
          }
        }
      }

      // 3. Write the limit when at least one of the amounts is positive.
      const wantLimit =
        values.normalAmount !== "0" || values.cushionAmount !== "0";
      if (wantLimit) {
        const limitBody: Record<string, unknown> = {
          normalAmount: values.normalAmount,
          cushionAmount: values.cushionAmount,
        };
        if (isEdit && "effectiveFrom" in values) {
          limitBody.effectiveFrom = (
            values as { effectiveFrom: string }
          ).effectiveFrom;
        }
        const lim = await clientApiFetch(`/categories/${categoryId}/limits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(limitBody),
        });
        if (!lim.ok) {
          setServerError(tLim("errors.saveFailed"));
          return;
        }
      }

      onSuccess?.();
    } catch {
      setServerError(tCat("form.errors.network"));
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
              <FormLabel>{tCat("form.name")}</FormLabel>
              <FormControl>
                <Input placeholder={tCat("form.namePlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="normalAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tLim("normalAmount")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {cushionEnabled && (
          <FormField
            control={form.control}
            name="cushionAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tLim("cushionAmount")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {isEdit && (
          <FormField
            control={form.control}
            name={"effectiveFrom" as never}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tLim("effectiveFrom")}</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    className="bg-[var(--surface-dark)] text-[var(--on-dark)] [color-scheme:dark]"
                    {...(field as { value?: string })}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex gap-2 justify-end">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {tCat("form.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCat("form.save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
