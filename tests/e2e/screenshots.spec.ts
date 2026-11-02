/**
 * Full-page screenshots for design review: every light and dark page and the 404 page, at a phone
 * width and a desktop width, written to test-results/screenshots/<page>-<width>.png. They are not
 * baselines and nothing compares them, so this spec passes whatever the page looks like. It is the
 * `screenshots` project of playwright.config.ts, which the `chromium` project (`pnpm test:e2e`)
 * ignores, and `pnpm screenshots` runs only this one.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { KEY_WIDTHS, PAGES, VIEWPORT_HEIGHT, open, test } from './support';

const DIRECTORY = join('test-results', 'screenshots');

for (const width of KEY_WIDTHS) {
  test.describe(`screenshots at ${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const info of PAGES) {
      test(info.label, async ({ page }) => {
        mkdirSync(DIRECTORY, { recursive: true });
        await open(page, info);
        await page.screenshot({ path: join(DIRECTORY, `${info.label.replace(/\s+/g, '-')}-${width}.png`), fullPage: true });
      });
    }
  });
}
