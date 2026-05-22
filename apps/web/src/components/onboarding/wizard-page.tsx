"use client";

/**
 * wizard-page.tsx — 5-step onboarding wizard (D-05, D-06)
 *
 * Single-page React step machine — ONE route, all state in React, no per-step
 * URLs. Budget row created at step 1, PATCHed onward. Resumable via ?step param.
 *
 * Step flow:
 *   1. Name      → POST /budgets (locale-guessed currency)
 *   2. Currency  → PATCH budget
 *   3. Type      → PATCH budget
 *   4. Categories → POST each category
 *   5. Review    → PUT /onboarding/progress {step:5, completedAt} → redirect
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { toast } from "sonner";
import { WizardLayout } from "./wizard-layout";
import { StepName } from "./steps/step-name";
import { StepCurrency } from "./steps/step-currency";
import { StepType } from "./steps/step-type";
import { StepCategories, STARTER_CATEGORIES } from "./steps/step-categories";
import { StepReview } from "./steps/step-review";
import { api } from "@/lib/api-client";

type Step = 1 | 2 | 3 | 4 | 5;

interface WizardForm {
  name: string;
  currency: string;
  kind: "PRIVATE" | "SHARED";
  categories: string[];
}

interface WizardPageProps {
  locale?: string;
}

/**
 * Guess a sensible default currency from the browser locale.
 * pl-* → PLN, uk-* → UAH, default → USD.
 */
function guessCurrency(language: string): string {
  const lang = language.toLowerCase();
  if (lang.startsWith("pl")) return "PLN";
  if (lang.startsWith("uk")) return "UAH";
  return "USD";
}

export function WizardPage({ locale: localeProp }: WizardPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const locale =
    localeProp ?? (typeof params?.locale === "string" ? params.locale : "en");

  // Derive initial step from ?step query param (resume — D-06)
  const initialStep = (() => {
    const s = searchParams?.get("step");
    const n = s ? parseInt(s, 10) : 1;
    return (n >= 1 && n <= 5 ? n : 1) as Step;
  })();

  const [step, setStep] = useState<Step>(initialStep);
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<WizardForm>({
    name: "",
    currency: "USD", // Will be updated on mount with locale guess
    kind: "PRIVATE",
    categories: [...STARTER_CATEGORIES],
  });

  // Update currency with locale guess on client-side mount
  useEffect(() => {
    const guessed = guessCurrency(
      typeof navigator !== "undefined" ? navigator.language : "en-US",
    );
    setForm((f) => ({ ...f, currency: guessed }));
  }, []);

  const updateForm = <K extends keyof WizardForm>(
    key: K,
    value: WizardForm[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  /** Upsert onboarding progress for a given step */
  async function putProgress(s: number, completedAt?: string) {
    try {
      await api.onboarding.progress.$put({
        json: { step: s, ...(completedAt ? { completedAt } : {}) },
      });
    } catch {
      // best-effort — don't block wizard
    }
  }

  /** Handle "Next" / "Create budget" */
  async function onNext() {
    setIsLoading(true);
    setNameError(null);
    setCategoriesError(null);

    try {
      if (step === 1) {
        // Validate name
        if (!form.name.trim()) {
          setNameError("Budget name is required.");
          setIsLoading(false);
          return;
        }
        // D-06: Create budget row at step 1
        const res = await api.budgets.$post({
          json: {
            name: form.name.trim(),
            kind: form.kind,
            default_currency: form.currency,
          },
        });
        if (!res.ok) {
          toast.error("Something went wrong — try again");
          setIsLoading(false);
          return;
        }
        const data = (await res.json()) as { id: string; name: string };
        setBudgetId(data.id);
        await putProgress(1);
        setStep(2);
      } else if (step === 2) {
        // PATCH budget currency
        if (budgetId) {
          await api.budgets[":id"].$patch({
            param: { id: budgetId },
            json: { default_currency: form.currency },
          });
        }
        await putProgress(2);
        setStep(3);
      } else if (step === 3) {
        // PATCH budget kind
        if (budgetId) {
          await api.budgets[":id"].$patch({
            param: { id: budgetId },
            json: { kind: form.kind },
          });
        }
        await putProgress(3);
        setStep(4);
      } else if (step === 4) {
        // Validate categories
        if (form.categories.length === 0) {
          setCategoriesError("Select at least one category.");
          setIsLoading(false);
          return;
        }
        // POST each selected category
        if (budgetId) {
          await Promise.all(
            form.categories.map((name) =>
              api.budgets[":budgetId"].categories.$post({
                param: { budgetId },
                json: { name, planned: 0, cushion: 0 },
              }),
            ),
          );
        }
        await putProgress(4);
        setStep(5);
      } else if (step === 5) {
        // Finish: PUT progress with completedAt + redirect to spendings
        const completedAt = new Date().toISOString();
        await putProgress(5, completedAt);
        router.push(`/${locale}/budgets/${budgetId}/spendings`);
        return; // avoid setIsLoading(false) on redirect
      }
    } catch {
      toast.error("Something went wrong — try again");
    }

    setIsLoading(false);
  }

  /** Handle "Skip" (steps 2-4) — advance without saving */
  function onSkip() {
    if (step >= 2 && step <= 4) {
      setStep((s) => (s + 1) as Step);
    }
  }

  /** Handle "Back" — decrement step (D-08 back navigation allowed) */
  function onBack() {
    if (step > 1) {
      setNameError(null);
      setCategoriesError(null);
      setStep((s) => (s - 1) as Step);
    }
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <StepName
            value={form.name}
            onChange={(v) => updateForm("name", v)}
            error={nameError ?? undefined}
          />
        );
      case 2:
        return (
          <StepCurrency
            value={form.currency}
            onChange={(v) => updateForm("currency", v)}
          />
        );
      case 3:
        return (
          <StepType value={form.kind} onChange={(v) => updateForm("kind", v)} />
        );
      case 4:
        return (
          <StepCategories
            selected={form.categories}
            onChange={(v) => updateForm("categories", v)}
            error={categoriesError ?? undefined}
          />
        );
      case 5:
        return (
          <StepReview
            name={form.name}
            currency={form.currency}
            kind={form.kind}
            categories={form.categories}
          />
        );
    }
  }

  return (
    <WizardLayout
      currentStep={step}
      onBack={onBack}
      onSkip={onSkip}
      onNext={onNext}
      isLoading={isLoading}
      nextLabel={step === 5 ? "Create budget" : "Next"}
    >
      {renderStep()}
    </WizardLayout>
  );
}
