import type { UserId } from '@budget/shared-kernel';

export type Locale = 'en' | 'pl' | 'uk';
export type LLMProviderName = 'claude_haiku' | 'groq';
export type STTProviderName = 'browser' | 'groq';

export interface UserDTO {
  id: UserId;
  email: string;             // decrypted at adapter boundary
  name: string;              // decrypted at adapter boundary
  emailVerified: boolean;
  locale: Locale;
  display_currency: string;  // ISO-4217 (per D-05/MONY-09)
  preferred_llm_provider: LLMProviderName | null;
  preferred_stt_provider: STTProviderName | null;
}

export interface SessionDTO {
  id: string;
  userId: UserId;
  device: string;
  ipAddress: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}
