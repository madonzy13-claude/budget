"use client";

/**
 * wizard-page.tsx — 4-step onboarding wizard (deferred-create rewrite).
 *
 * Single-page React step machine. ONE route, all state in React, no per-step
 * URLs.
 *
 * Step flow (kind-removal: no Type step):
 *   0. Welcome   → "Get started" advances to step 1; no API call.
 *   1. Basics    → collect name + currency; no API call.
 *   2. Features  → collect cushion + reserves + push toggles; no API call.
 *   3. Review    → "Create budget" performs:
 *                    - POST   /budgets       (name, default_currency)
 *                    - PATCH  /budgets/:id   (cushion_mode_enabled if true,
 *                                             reserves_enabled if false)
 *                    - PUT    /onboarding/progress  (step=4, completedAt)
 *                  Then redirects to /budgets/[id]/spendings.
 *
 * Why defer all writes until Step 4: the previous early-create flow left
 * orphan budgets when a user abandoned mid-wizard, required juggling
 * X-Budget-ID headers from the no-budget /budgets/new path, and forced
 * mid-wizard PATCH calls that couldn't actually mutate `kind` (no schema
 * support). Collecting form state client-side avoids all three problems
 * and aligns with the user's spreadsheet-replacement workflow where the
 * "first save" event is meaningful.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { WizardLayout } from "./wizard-layout";
import { StepWelcome } from "./steps/step-welcome";
import { StepBasics } from "./steps/step-basics";
import { StepFeatures } from "./steps/step-features";
import { StepReview } from "./steps/step-review";
import { api } from "@/lib/api-client";
import { clientApiWrite } from "@/lib/offline-write";
import { subscribeToPushForBudget } from "@/lib/push-subscribe";

// kind-removal: the Type step is gone. Steps are now
// 0 Welcome, 1 Basics, 2 Features, 3 Review.
type Step = 0 | 1 | 2 | 3;

interface WizardForm {
  name: string;
  currency: string;
  cushionEnabled: boolean;
  reservesEnabled: boolean;
  /** Phase 9: opt into the Investments wallet section. Default off. */
  investmentsEnabled: boolean;
  /** Opt into push notifications (reminders/tasks) + the app-icon badge. Default
   *  off — enabling it triggers the browser permission prompt on Create budget. */
  notificationsEnabled: boolean;
  /** Phase 7-09: desired cushion runway in months. Default 6. */
  cushionTargetMonths: number;
}

interface WizardPageProps {
  locale?: string;
  /**
   * Server-derived signal: the caller already has at least one budget.
   * When true, the wizard skips step 0 (welcome) and opens on step 1
   * (Basics). The welcome card is a first-budget intro — showing it on
   * every subsequent budget would read as patronising.
   */
  skipWelcome?: boolean;
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

export function WizardPage({
  locale: localeProp,
  skipWelcome = false,
}: WizardPageProps) {
  const params = useParams();
  const locale =
    localeProp ?? (typeof params?.locale === "string" ? params.locale : "en");
  const tBasics = useTranslations("onboarding.wizard.basics");
  const tActions = useTranslations("onboarding.wizard.actions");
  const tErrors = useTranslations("onboarding.wizard.errors");
  const tInvest = useTranslations("budget.investments");

  // Defer-create model: a mid-wizard refresh restarts from step 0/1
  // rather than resuming a server-stored step pointer. The layout guard
  // already routes onboarding-incomplete users back to /budgets/new when
  // no budget exists, so this is a no-data-loss restart from the user's
  // standpoint — they fill the four short steps again.
  //
  // skipWelcome: returning users (any existing budget) bypass step 0 so
  // they don't get the first-budget intro card every time they add
  // another budget.
  const [step, setStep] = useState<Step>(skipWelcome ? 1 : 0);
  const [isLoading, setIsLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Form state. Both feature flags default ON: the wizard advertises them
  // as standard for new budgets, and the underlying columns
  // (reserves_enabled, cushion_enabled) also default true server-side.
  const [form, setForm] = useState<WizardForm>({
    name: "",
    currency: "USD",
    cushionEnabled: true,
    reservesEnabled: true,
    investmentsEnabled: false,
    notificationsEnabled: false,
    cushionTargetMonths: 6,
  });

  // Update currency with locale guess on client-side mount.
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

  /**
   * Final-step write path. POST budget → PATCH feature toggles only when
   * non-default → PUT progress completedAt → redirect.
   * PATCH calls land AFTER POST so the api-client's X-Budget-ID middleware
   * can derive the header from the response URL.
   */
  async function commitWizard(): Promise<void> {
    // Create the budget.
    const createRes = await api.budgets.$post({
      json: {
        name: form.name.trim(),
        default_currency: form.currency,
      },
    });
    if (!createRes.ok) {
      throw new Error("budget_create_failed");
    }
    const created = (await createRes.json()) as { id: string };
    const budgetId = created.id;

    // PATCH only the toggles that diverge from server defaults
    // (cushion_enabled default ON, reserves_enabled default ON).
    // The wizard NEVER touches cushion_mode_enabled — that flag is the
    // per-month SCD-2 mode tracker, owned by Settings → Cushion mode.
    const patchPayload: {
      cushion_enabled?: boolean;
      reserves_enabled?: boolean;
      investments_enabled?: boolean;
      cushion_target_months?: number;
    } = {};
    if (!form.cushionEnabled) patchPayload.cushion_enabled = false;
    if (!form.reservesEnabled) patchPayload.reserves_enabled = false;
    // Investments default OFF server-side — only PATCH when the user opted in.
    if (form.investmentsEnabled) patchPayload.investments_enabled = true;
    if (form.cushionEnabled) {
      // Phase 7-09 (D-PH7-33): always send target months when cushion is
      // enabled, so the server has truthy data even if the user kept the
      // default. PATCH route is idempotent on equal values.
      patchPayload.cushion_target_months = form.cushionTargetMonths;
    }
    if (Object.keys(patchPayload).length > 0) {
      // The api-client middleware can't derive X-Budget-ID from the
      // /budgets/new URL — pass it explicitly so the tenant guard accepts
      // the call (same workaround the pre-defer flow used for currency).
      await api.budgets[":id"].$patch(
        {
          param: { id: budgetId },
          json: patchPayload,
        },
        { headers: { "X-Budget-ID": budgetId } },
      );
    }

    // Investments enabled in the wizard → create the smart Investments category
    // NOW (at budget creation), not deferred to the first time Settings →
    // Investments is opened. ensureInvestmentCategory is idempotent, so the
    // Settings reconcile is harmless. Best-effort: the category can still be
    // created from Settings if this fails.
    if (form.investmentsEnabled) {
      try {
        await clientApiWrite(`/budgets/${budgetId}/investment-category`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Budget-ID": budgetId,
          },
          body: JSON.stringify({
            name: tInvest("smart_category.default_name"),
          }),
        });
      } catch {
        /* best-effort — creatable later from Settings */
      }
    }

    // Notifications: opted in → subscribe THIS budget to push (fires the browser
    // permission prompt) and, on success, silently enable the app-icon BADGE too.
    // There is intentionally no separate badge toggle in the wizard — enabling
    // notifications enables the badge in the background. Best-effort: onboarding
    // must complete even if permission is denied or the network hiccups; the user
    // can still manage both from Settings → Notifications.
    if (form.notificationsEnabled) {
      try {
        const result = await subscribeToPushForBudget(budgetId);
        if (result === "subscribed") {
          await api.push.preferences.$patch(
            { json: { budgetId, notificationType: "BADGE", enabled: true } },
            { headers: { "X-Budget-ID": budgetId } },
          );
        }
      } catch {
        /* best-effort — enable later from Settings → Notifications */
      }
    }

    // Mark onboarding complete.
    const completedAt = new Date().toISOString();
    try {
      await api.onboarding.progress.$put({
        json: { step: 4, completedAt },
      });
    } catch {
      // best-effort — the budget exists; user can manually navigate.
    }

    // Hard navigation: router.push has been observed to race with the
    // just-set active-workspace cookie during the post-create redirect
    // chain. window.location.assign avoids the race.
    window.location.assign(`/${locale}/budgets/${budgetId}/spendings`);
  }

  /** Handle "Next" / "Get started" / "Create budget" */
  async function onNext() {
    setIsLoading(true);
    setNameError(null);

    try {
      if (step === 0) {
        setStep(1);
      } else if (step === 1) {
        // Step 1 (Basics) requires a non-empty name before advancing.
        if (!form.name.trim()) {
          setNameError(tBasics("name_required"));
          setIsLoading(false);
          return;
        }
        setStep(2);
      } else if (step === 2) {
        setStep(3);
      } else if (step === 3) {
        await commitWizard();
        return; // avoid setIsLoading(false) on redirect
      }
    } catch {
      toast.error(tErrors("network"));
    }

    setIsLoading(false);
  }

  /** Handle "Back" — decrement step. Step 0 has no back. */
  function onBack() {
    if (step > 1) {
      setNameError(null);
      setStep((s) => (s - 1) as Step);
    }
  }

  /**
   * Stepper jump-back. The stepper only invokes this for COMPLETED
   * segments (target < step), but we re-assert that here so an
   * out-of-bound jump call cannot push the user forward without going
   * through onNext (which enforces validation per step).
   */
  function onStepJump(target: 1 | 2 | 3) {
    if (target < step) {
      setNameError(null);
      setStep(target);
    }
  }

  function renderStep() {
    switch (step) {
      case 0:
        return <StepWelcome />;
      case 1:
        return (
          <StepBasics
            name={form.name}
            onChangeName={(v) => updateForm("name", v)}
            nameError={nameError ?? undefined}
            currency={form.currency}
            onChangeCurrency={(v) => updateForm("currency", v)}
          />
        );
      case 2:
        return (
          <StepFeatures
            cushionEnabled={form.cushionEnabled}
            onChangeCushion={(v) => updateForm("cushionEnabled", v)}
            reservesEnabled={form.reservesEnabled}
            onChangeReserves={(v) => updateForm("reservesEnabled", v)}
            investmentsEnabled={form.investmentsEnabled}
            onChangeInvestments={(v) => updateForm("investmentsEnabled", v)}
            notificationsEnabled={form.notificationsEnabled}
            onChangeNotifications={(v) => updateForm("notificationsEnabled", v)}
            cushionTargetMonths={form.cushionTargetMonths}
            onChangeCushionTargetMonths={(v) =>
              updateForm("cushionTargetMonths", v)
            }
          />
        );
      case 3:
        return (
          <StepReview
            name={form.name}
            currency={form.currency}
            cushionEnabled={form.cushionEnabled}
            reservesEnabled={form.reservesEnabled}
          />
        );
    }
  }

  return (
    <WizardLayout
      currentStep={step}
      onBack={onBack}
      onNext={onNext}
      onStepJump={onStepJump}
      isLoading={isLoading}
      nextLabel={
        step === 0
          ? tActions("get_started")
          : step === 3
            ? tActions("create_budget")
            : tActions("next")
      }
    >
      {renderStep()}
    </WizardLayout>
  );
}
