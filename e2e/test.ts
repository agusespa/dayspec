import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

/** Base port of the e2e servers; worker N talks to its own server and routine file on BASE_PORT + N. */
export const BASE_PORT = 8182;

export const test = base.extend({
  baseURL: async ({}, use, testInfo) => {
    await use(`http://localhost:${BASE_PORT + testInfo.parallelIndex}`);
  },
});
