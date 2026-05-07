/**
 * Re-exports the extended test and expect from the freshUser fixture.
 * All step files import { test, expect } from here — never directly from
 * playwright-bdd or @playwright/test.
 */
export { test, expect } from "./freshUser.js";
