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
  topCurrenciesHeader: RegExp;
  usDollarLabel: string;
  ukrainianHryvniaLabel: string;
}

interface LocaleLabels {
  signUp: SignUpLabels;
  signIn: SignInLabels;
  verifyEmailSubject: RegExp;
  currencyPicker: CurrencyPickerLabels;
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
      triggerPlaceholder: /search currency/i,
      topCurrenciesHeader: /top currencies/i,
      usDollarLabel: "US Dollar",
      ukrainianHryvniaLabel: "Ukrainian Hryvnia",
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
      triggerPlaceholder: /wyszukaj walutę/i,
      topCurrenciesHeader: /popularne waluty/i,
      usDollarLabel: "Dolar amerykański",
      ukrainianHryvniaLabel: "Hrywna ukraińska",
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
      triggerPlaceholder: /пошук валюти/i,
      topCurrenciesHeader: /популярні валюти/i,
      usDollarLabel: "Долар США",
      ukrainianHryvniaLabel: "Українська гривня",
    },
  },
};
