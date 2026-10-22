import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4400);
// The CI container receives an allowlisted environment without CI, so hosted Actions counts too.
const CI = Boolean(process.env.CI) || process.env.GITHUB_ACTIONS === 'true';
// Hosted CI uses only the authenticated immutable Chrome Stable image installation.
const managedBrowser = process.env.GITHUB_ACTIONS === 'true' || existsSync('/opt/company/browser-policy.json');
if (managedBrowser) execFileSync('/opt/node/bin/node', ['/opt/company/check-browser-policy.mjs'], { stdio: 'inherit', timeout: 10000 });
// The CI image keeps XDG_CONFIG_HOME read-only so the package manager config cannot change. Chrome keeps its
// crash database there and exits at launch without it, so only the managed browser gets fresh writable XDG directories.
const browserHome = managedBrowser ? mkdtempSync(join(tmpdir(), 'company-chrome-')) : '';
const browserXdg = { XDG_CONFIG_HOME: join(browserHome, 'config'), XDG_CACHE_HOME: join(browserHome, 'cache') };
if (managedBrowser) for (const directory of Object.values(browserXdg)) mkdirSync(directory, { mode: 0o700 });
const browserChannel = managedBrowser
  ? { channel: 'chrome' as const, launchOptions: { env: { ...process.env, ...browserXdg } } }
  : {};
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
  // A broken browser or server fails every test. Stop early so the report stays small enough to pack and upload.
  maxFailures: CI ? 10 : 0,
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
