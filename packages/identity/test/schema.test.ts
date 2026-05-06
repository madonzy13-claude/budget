/**
 * Task 2 TDD RED: Schema structure tests
 */
import { test, expect } from "bun:test";
import {
  users,
  sessions,
  accounts,
  verifications,
} from "../src/adapters/persistence/schema";
import { userPreferences } from "../src/adapters/persistence/user-preferences";

test("identity.users table is declared", () => {
  expect(users).toBeDefined();
});

test("identity.sessions table is declared", () => {
  expect(sessions).toBeDefined();
});

test("identity.accounts table is declared", () => {
  expect(accounts).toBeDefined();
});

test("identity.verifications table is declared", () => {
  expect(verifications).toBeDefined();
});

test("identity.user_preferences table is declared", () => {
  expect(userPreferences).toBeDefined();
});
