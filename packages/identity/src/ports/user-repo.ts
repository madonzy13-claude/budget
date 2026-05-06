import type { UserId } from '@budget/shared-kernel';
import type { Locale, LLMProviderName, STTProviderName, UserDTO, SessionDTO } from '../contracts/api';

export interface UserRepo {
  findById(id: UserId): Promise<UserDTO | null>;
  findByEmail(email: string): Promise<UserDTO | null>;        // uses email_hash
  updateLocale(id: UserId, locale: Locale): Promise<void>;
  updateDisplayCurrency(id: UserId, currency: string): Promise<void>;
  updateProviderPrefs(id: UserId, prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null }): Promise<void>;
  getActiveWorkspaceIds(id: UserId): Promise<string[]>;
  setActiveWorkspaceIds(id: UserId, ids: string[]): Promise<void>;
}
