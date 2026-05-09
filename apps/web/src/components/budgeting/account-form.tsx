"use client";

/**
 * account-form.tsx — RHF form for creating a new account
 * Per UI-SPEC §Accounts: name, kind, scope tabs, currency picker.
 * Generates Idempotency-Key on mount (useState initializer).
 * Submits via fetch('/api/accounts', { headers: {'Idempotency-Key': key} }).
 */
import { useState, useMemo } from "react";
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
import { CurrencyPicker } from "@/components/common/currency-picker";
import { cn } from "@/lib/utils";

type AccountKind =
  | "CASH"
  | "CHECKING"
  | "SAVINGS"
  | "CREDIT_CARD"
  | "LOAN"
  | "INVESTMENT";
type AccountScope = "PERSONAL" | "SHARED";

type AccountFormValues = {
  name: string;
  kind: AccountKind;
  scope: AccountScope;
  currency: string;
};

interface AccountFormProps {
  tenantId: string;
  userId: string;
  onSuccess?: (account: { id: string; name: string }) => void;
  onCancel?: () => void;
}

const ACCOUNT_KINDS: AccountKind[] = [
  "CASH",
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "LOAN",
  "INVESTMENT",
];

const ACCOUNT_SCOPES: AccountScope[] = ["PERSONAL", "SHARED"];

export function AccountForm({
  tenantId,
  userId,
  onSuccess,
  onCancel,
}: AccountFormProps) {
  const t = useTranslations();

  // Idempotency-Key generated once per form mount (ACCT idempotency contract)
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [serverError, setServerError] = useState<string | null>(null);

  const formSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1).max(120),
        kind: z.enum([
          "CASH",
          "CHECKING",
          "SAVINGS",
          "CREDIT_CARD",
          "LOAN",
          "INVESTMENT",
        ]),
        scope: z.enum(["PERSONAL", "SHARED"]),
        currency: z.string().min(3).max(5),
      }),
    [],
  );

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      kind: "CASH",
      scope: "PERSONAL",
      currency: "",
    },
    mode: "onBlur",
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: AccountFormValues) {
    setServerError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setServerError(err.error ?? "Something went wrong");
        return;
      }

      const account = (await res.json()) as { id: string; name: string };
      toast.success(`Account "${account.name}" created`);
      onSuccess?.(account);
    } catch {
      setServerError("Network error — check your connection");
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {/* Account name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgeting.accounts.form.nameLabel")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("budgeting.accounts.form.namePlaceholder")}
                  aria-label={t("budgeting.accounts.form.nameLabel")}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Account kind */}
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgeting.accounts.form.kindLabel")}</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ACCOUNT_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`budgeting.accounts.kinds.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Scope — PERSONAL / SHARED tabs */}
        <FormField
          control={form.control}
          name="scope"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgeting.accounts.form.scopeLabel")}</FormLabel>
              <FormControl>
                <div role="tablist" className="flex gap-2">
                  {ACCOUNT_SCOPES.map((scope) => {
                    const active = field.value === scope;
                    return (
                      <button
                        key={scope}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => field.onChange(scope)}
                        className={cn(
                          "min-h-[44px] flex-1 rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium transition-colors",
                          active
                            ? "border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_8%,transparent)] text-[var(--foreground)]"
                            : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--muted-strong)]",
                        )}
                      >
                        {t(`budgeting.accounts.scopes.${scope}`)}
                      </button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Currency picker */}
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgeting.accounts.form.currencyLabel")}</FormLabel>
              <FormControl>
                <CurrencyPicker
                  value={field.value}
                  onSelect={field.onChange}
                  placeholder={t("budgeting.accounts.form.currencyPlaceholder")}
                  aria-label={t("budgeting.accounts.form.currencyLabel")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t("budgeting.accounts.form.cancelButton")}
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color-mix(in_oklab,var(--primary)_85%,black)]"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("state.loading")}
              </>
            ) : (
              t("budgeting.accounts.form.saveButton")
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
