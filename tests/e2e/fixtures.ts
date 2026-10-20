import { createHash } from 'node:crypto';
import { test as base } from '@playwright/test';

// The isolated server trusts forwarding only from its local test client.
// Each scenario represents its own client; real rate limits remain enabled.
export const test = base.extend({
  extraHTTPHeaders: async ({}, use, info) => {
    const bytes = createHash('sha256').update(info.testId).digest();
    await use({ 'x-forwarded-for': `198.18.${bytes[0]}.${bytes[1]}` });
  },
});
export { expect } from '@playwright/test';
