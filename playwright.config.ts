import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4400);
// The CI container receives an allowlisted environment without CI, so hosted Actions counts too.
const CI = Boolean(process.env.CI) || process.env.GITHUB_ACTIONS === 'true';
// Hosted CI uses only the authenticated immutable Chrome Stable image installation.
const managedBrowser = process.env.GITHUB_ACTIONS === 'true' || existsSync('/opt/company/browser-policy.json');
if (managedBrowser) execFileSync('/opt/node/bin/node', ['/opt/company/check-browser-policy.mjs'], { stdio: 'inherit', timeout: 10000 });
const browserChannel = managedBrowser ? { channel: 'chrome' as const } : {};
const SCREENSHOTS = '**/screenshots.spec.ts';

// End-to-end tests drive the built site through `astro preview`, so the site has to be built first.
if (!existsSync(new URL('./dist/index.html', import.meta.url))) {
  throw new Error('dist/ is missing. Run `pnpm build` before `pnpm test:e2e`.');
}

// Tests never download browsers. Hosted CI selects the checked Chrome Stable channel.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0, // a flaky test is a bug in the test
  // Stop well inside the 25-minute job so the report is written, packed and uploaded.
  globalTimeout: CI ? 14 * 60_000 : 0,
  // CI keeps a report and a trace of every failure, which its workflow uploads. Locally the list is enough.
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // A static page answers at once. A locator that finds nothing after 3 seconds never will.
    actionTimeout: 3_000,
    navigationTimeout: 15_000,
    trace: CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    // `pnpm test:e2e`: every check.
    { name: 'chromium', testIgnore: SCREENSHOTS, use: { ...devices['Desktop Chrome'], screen: undefined, ...browserChannel } },
    // `pnpm screenshots`: full-page pictures for design review. They check nothing and take a while, so only this project runs them.
    { name: 'screenshots', testMatch: SCREENSHOTS, use: { ...devices['Desktop Chrome'], screen: undefined, ...browserChannel } },
  ],
  webServer: {
    command: `pnpm exec astro preview --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
