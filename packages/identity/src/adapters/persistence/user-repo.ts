// Stub — fully implemented in Task 3
// This file MUST NOT be imported directly by domain/application/ports layers.

import type { UserRepo } from '../../ports/user-repo';
import type { Locale, LLMProviderName, STTProviderName, UserDTO } from '../../contracts/api';
import type { UserId } from '@budget/shared-kernel';

export class DrizzleUserRepo implements UserRepo {
  async findById(_id: UserId): Promise<UserDTO | null> {
    throw new Error('DrizzleUserRepo.findById: not yet implemented');
  }
  async findByEmail(_email: string): Promise<UserDTO | null> {
    throw new Error('DrizzleUserRepo.findByEmail: not yet implemented');
  }
  async updateLocale(_id: UserId, _locale: Locale): Promise<void> {
    throw new Error('DrizzleUserRepo.updateLocale: not yet implemented');
  }
  async updateDisplayCurrency(_id: UserId, _currency: string): Promise<void> {
    throw new Error('DrizzleUserRepo.updateDisplayCurrency: not yet implemented');
  }
  async updateProviderPrefs(_id: UserId, _prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null }): Promise<void> {
    throw new Error('DrizzleUserRepo.updateProviderPrefs: not yet implemented');
  }
  async getActiveWorkspaceIds(_id: UserId): Promise<string[]> {
    throw new Error('DrizzleUserRepo.getActiveWorkspaceIds: not yet implemented');
  }
  async setActiveWorkspaceIds(_id: UserId, _ids: string[]): Promise<void> {
    throw new Error('DrizzleUserRepo.setActiveWorkspaceIds: not yet implemented');
  }
}
