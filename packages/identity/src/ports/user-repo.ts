import type { UserId } from "@budget/shared-kernel";
import type { Locale, UserDTO } from "../contracts/api";

export interface UserRepo {
  findById(id: UserId): Promise<UserDTO | null>;
  findByEmail(email: string): Promise<UserDTO | null>; // uses email_hash
  updateLocale(id: UserId, locale: Locale): Promise<void>;
  updateDisplayCurrency(id: UserId, currency: string): Promise<void>;
  /** Update the user's IANA timezone (validated at the route boundary). */
  updateTimezone(id: UserId, timezone: string): Promise<void>;
  /** Update the user's UI theme ("dark" | "light"). */
  updateTheme(id: UserId, theme: string): Promise<void>;
  /** Seed display_currency only if still unset (NULL) — never clobbers a choice. */
  setDisplayCurrencyIfUnset(id: UserId, currency: string): Promise<void>;
  getActiveWorkspaceIds(id: UserId): Promise<string[]>;
  setActiveWorkspaceIds(id: UserId, ids: string[]): Promise<void>;
}
