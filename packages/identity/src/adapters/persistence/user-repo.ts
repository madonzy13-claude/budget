// This file MUST NOT be imported directly by domain/application/ports layers.
// Domain/application code accesses this only through the UserRepo port interface.
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { appPool, withUserContext } from "@budget/platform";
import type { UserId } from "@budget/shared-kernel";
import type { UserRepo } from "../../ports/user-repo";
import type {
  Locale,
  LLMProviderName,
  STTProviderName,
  UserDTO,
} from "../../contracts/api";
import { users } from "./schema";
import { userPreferences } from "./user-preferences";

function getDb() {
  return drizzle(appPool(), { casing: "snake_case" });
}

export class DrizzleUserRepo implements UserRepo {
  async findById(id: UserId): Promise<UserDTO | null> {
    const r = await withUserContext(id, async (tx) => {
      const rows = await tx
        .select()
        .from(users)
        .where(eq(users.id, id as string));
      return rows[0] ?? null;
    });
    if (r.isErr() || !r.value) return null;
    const row = r.value;
    return {
      id: row.id as UserId,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerified,
      locale: row.locale as Locale,
      display_currency: row.displayCurrency,
      preferred_llm_provider: row.preferredLlmProvider as LLMProviderName | null,
      preferred_stt_provider: row.preferredSttProvider as STTProviderName | null,
    };
  }

  async findByEmail(email: string): Promise<UserDTO | null> {
    // email lookup uses plain email text for now (Phase 6 drops to email_hash only)
    // We cannot use withUserContext here because we don't know the userId yet.
    const db = getDb();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      id: row.id as UserId,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerified,
      locale: row.locale as Locale,
      display_currency: row.displayCurrency,
      preferred_llm_provider: row.preferredLlmProvider as LLMProviderName | null,
      preferred_stt_provider: row.preferredSttProvider as STTProviderName | null,
    };
  }

  async updateLocale(id: UserId, locale: Locale): Promise<void> {
    const r = await withUserContext(id, async (tx) => {
      await tx
        .update(users)
        .set({ locale, updatedAt: new Date() })
        .where(eq(users.id, id as string));
    });
    if (r.isErr()) throw r.error;
  }

  async updateDisplayCurrency(id: UserId, currency: string): Promise<void> {
    const r = await withUserContext(id, async (tx) => {
      await tx
        .update(users)
        .set({ displayCurrency: currency, updatedAt: new Date() })
        .where(eq(users.id, id as string));
    });
    if (r.isErr()) throw r.error;
  }

  async updateProviderPrefs(
    id: UserId,
    prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null },
  ): Promise<void> {
    const updates: Partial<{
      preferredLlmProvider: string | null;
      preferredSttProvider: string | null;
      updatedAt: Date;
    }> = { updatedAt: new Date() };
    if (prefs.llm !== undefined) updates.preferredLlmProvider = prefs.llm;
    if (prefs.stt !== undefined) updates.preferredSttProvider = prefs.stt;

    const r = await withUserContext(id, async (tx) => {
      await tx
        .update(users)
        .set(updates)
        .where(eq(users.id, id as string));
    });
    if (r.isErr()) throw r.error;
  }

  async getActiveWorkspaceIds(id: UserId): Promise<string[]> {
    const r = await withUserContext(id, async (tx) => {
      const rows = await tx
        .select({ activeWorkspaceIds: userPreferences.activeWorkspaceIds })
        .from(userPreferences)
        .where(eq(userPreferences.userId, id as string));
      return rows[0]?.activeWorkspaceIds ?? [];
    });
    if (r.isErr()) return [];
    return r.value;
  }

  async setActiveWorkspaceIds(id: UserId, ids: string[]): Promise<void> {
    const r = await withUserContext(id, async (tx) => {
      await tx
        .insert(userPreferences)
        .values({
          userId: id as string,
          activeWorkspaceIds: ids,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            activeWorkspaceIds: ids,
            updatedAt: new Date(),
          },
        });
    });
    if (r.isErr()) throw r.error;
  }
}
