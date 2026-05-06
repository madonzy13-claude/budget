import type { UserId } from '@budget/shared-kernel';

export interface UserSignedUp {
  userId: UserId;
  email: string;
  locale: 'en' | 'pl' | 'uk';
  display_currency: string;
}

export interface UserVerified {
  userId: UserId;
}

export interface LocaleChanged {
  userId: UserId;
  locale: 'en' | 'pl' | 'uk';
}

export interface DisplayCurrencyChanged {
  userId: UserId;
  currency: string;
}

export interface SessionRevoked {
  userId: UserId;
  sessionId: string;
}
