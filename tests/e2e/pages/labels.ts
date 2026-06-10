/**
 * Single source of truth for locale-specific UI strings in E2E tests.
 * Page Objects import from here. Feature files NEVER reference these strings.
 */

export type Locale = "en" | "pl" | "uk";

interface SignUpLabels {
  name: RegExp;
  email: RegExp;
  password: RegExp;
  cta: RegExp;
  nameRequiredError: RegExp;
}

interface SignInLabels {
  email: RegExp;
  password: RegExp;
  cta: RegExp;
  invalidCredentials: RegExp;
  emailNotVerified: RegExp;
}

interface CurrencyPickerLabels {
  triggerPlaceholder: RegExp;
  /**
   * Picker aria-label — set on both the Radix SelectTrigger and the native iOS
   * <select> fallback. Locator-of-last-resort because the trigger renders the
   * 3-letter code (e.g. "EUR") once a value is selected, so hasText filters
   * lose. aria-label survives both states.
   */
  triggerAriaLabel: RegExp;
  usDollarLabel: string;
  ukrainianHryvniaLabel: string;
}

interface WorkspacesLabels {
  emptyCta: RegExp;
  createNameLabel: RegExp;
  createCurrencyLabel: RegExp;
  createCta: RegExp;
}

interface SettingsLabels {
  displayCurrencyTab: RegExp;
  displayCurrencyLabel: RegExp;
  localeTab: RegExp;
  localeSelectLabel: RegExp;
  localeOption: Record<"en" | "pl" | "uk", RegExp>;
}

interface LocaleLabels {
  signUp: SignUpLabels;
  signIn: SignInLabels;
  verifyEmailSubject: RegExp;
  currencyPicker: CurrencyPickerLabels;
  workspaces: WorkspacesLabels;
  settings: SettingsLabels;
}

export const LOCALE_LABELS: Record<Locale, LocaleLabels> = {
  en: {
    signUp: {
      name: /full name/i,
      email: /email address/i,
      password: /password/i,
      cta: /create account/i,
      nameRequiredError: /name is required/i,
    },
    signIn: {
      email: /email address/i,
      password: /password/i,
      cta: /sign in/i,
      invalidCredentials: /invalid email or password/i,
      emailNotVerified: /please verify your email address before signing in/i,
    },
    verifyEmailSubject: /verify/i,
    currencyPicker: {
      triggerPlaceholder: /select currency/i,
      triggerAriaLabel: /select currency/i,
      usDollarLabel: "US Dollar",
      ukrainianHryvniaLabel: "Ukrainian Hryvnia",
    },
    workspaces: {
      emptyCta: /create budget/i,
      createNameLabel: /budget name/i,
      createCurrencyLabel: /default currency/i,
      createCta: /create budget/i,
    },
    settings: {
      displayCurrencyTab: /display currency/i,
      displayCurrencyLabel: /display currency/i,
      localeTab: /^language$/i,
      localeSelectLabel: /display language/i,
      localeOption: {
        en: /english/i,
        pl: /polski/i,
        uk: /українська/i,
      },
    },
  },
  pl: {
    signUp: {
      name: /imię i nazwisko/i,
      email: /adres e-mail/i,
      password: /hasło/i,
      cta: /utwórz konto/i,
      nameRequiredError: /imię jest wymagane/i,
    },
    signIn: {
      email: /adres e-mail/i,
      password: /hasło/i,
      cta: /^zaloguj się$/i,
      invalidCredentials: /nieprawidłowy adres e-mail lub hasło/i,
      emailNotVerified: /potwierdź swój adres e-mail przed zalogowaniem/i,
    },
    verifyEmailSubject: /Potwierdź swój adres e-mail/,
    currencyPicker: {
      triggerPlaceholder: /wybierz walutę/i,
      triggerAriaLabel: /wybierz walutę/i,
      usDollarLabel: "Dolar amerykański",
      ukrainianHryvniaLabel: "Hrywna ukraińska",
    },
    workspaces: {
      emptyCta: /utwórz budżet/i,
      createNameLabel: /nazwa budżetu/i,
      createCurrencyLabel: /domyślna waluta/i,
      createCta: /utwórz budżet/i,
    },
    settings: {
      displayCurrencyTab: /waluta wyświetlania/i,
      displayCurrencyLabel: /waluta wyświetlania/i,
      localeTab: /język/i,
      localeSelectLabel: /język wyświetlania/i,
      localeOption: {
        en: /english/i,
        pl: /polski/i,
        uk: /українська/i,
      },
    },
  },
  uk: {
    signUp: {
      name: /повне ім'я/i,
      email: /електронна адреса/i,
      password: /пароль/i,
      cta: /створити обліковий запис/i,
      nameRequiredError: /ім'я є обов'язковим/i,
    },
    signIn: {
      email: /електронна адреса/i,
      password: /пароль/i,
      cta: /^увійти$/i,
      invalidCredentials: /невірна електронна адреса або пароль/i,
      emailNotVerified: /підтвердьте свою електронну адресу перед входом/i,
    },
    verifyEmailSubject: /Підтвердьте електронну адресу/,
    currencyPicker: {
      triggerPlaceholder: /виберіть валюту/i,
      triggerAriaLabel: /виберіть валюту/i,
      usDollarLabel: "Долар США",
      ukrainianHryvniaLabel: "Українська гривня",
    },
    workspaces: {
      emptyCta: /створити бюджет/i,
      createNameLabel: /назва бюджету/i,
      createCurrencyLabel: /типова валюта/i,
      createCta: /створити бюджет/i,
    },
    settings: {
      displayCurrencyTab: /валюта відображення/i,
      displayCurrencyLabel: /валюта відображення/i,
      localeTab: /мова/i,
      localeSelectLabel: /мова інтерфейсу/i,
      localeOption: {
        en: /english/i,
        pl: /polski/i,
        uk: /українська/i,
      },
    },
  },
};
