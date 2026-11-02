/**
 * Getting around, light and dark. The header nav and the mark lead to their pages within the
 * variant, the variant link swaps to the same page in the other one, light pages ignore the OS color
 * setting, and a dark page never flashes bright, even before its stylesheets arrive.
 */
import type { Page } from '@playwright/test';
import { toRgbString } from '../helpers/color';
import { page as pageOf } from '../helpers/dist';
import { LIGHT_TOKENS, NAV, VARIANT_LINK } from '../helpers/spec';
import { PAGES, expect, open, test } from './support';

const h1 = (p: Page) => p.getByRole('heading', { level: 1 });
const at = (url: string) => PAGES.find((p) => p.url === url)!;

for (const variant of ['light', 'dark'] as const) {
  const home = pageOf(variant === 'dark' ? 'dark-home' : 'home');
  const prefix = variant === 'dark' ? '/dark' : '';

  test.describe(`the header, ${variant}`, () => {
    for (const target of NAV) {
      const to = at(`${prefix}${target.path}`);
      test(`nav link ${target.n} ${target.label} leads from ${home.url} to ${to.url}`, async ({ page }) => {
        await open(page, home);
        await page.locator('header nav').getByRole('link', { name: new RegExp(`^${target.n}\\s*${target.label}$`) }).click();
        await expect(page).toHaveURL(new RegExp(`${to.url}$`));
        await expect(h1(page)).toHaveText(to.h1);
      });
    }

    test(`the mark leads from ${prefix}/about/ to ${home.url}`, async ({ page }) => {
      await open(page, `${prefix}/about/`);
      await page.locator('header a').filter({ has: page.locator('svg') }).click();
      await expect(page).toHaveURL(new RegExp(`${home.url}$`));
      await expect(h1(page)).toHaveText(home.h1);
    });
  });
}

test.describe('the variant link', () => {
  for (const from of PAGES) {
    test(`"${VARIANT_LINK[from.variant]}" on ${from.label} is visible and leads to ${from.twin}`, async ({ page }) => {
      await open(page, from);
      const link = page.getByRole('link', { name: VARIANT_LINK[from.variant], exact: true }).first();
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${from.twin}$`));
      await expect(h1(page)).toHaveText(at(from.twin).h1);
    });
  }
});

test.describe('the OS color setting', () => {
  for (const path of ['/', '/vivary/']) {
    for (const scheme of ['dark', 'light'] as const) {
      test(`${path} stays light when the OS asks for ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page, path);
        expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), 'the browser emulates the OS setting').toBe(scheme === 'dark');
        expect(await page.locator('meta[name="color-scheme"]').getAttribute('content')).toBe('light');
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(toRgbString(LIGHT_TOKENS['--paper']));
      });
    }
  }
});

test.describe('no bright flash', () => {
  for (const dark of PAGES.filter((p) => p.variant === 'dark')) {
    for (const blocked of [true, false]) {
      test(`${dark.label} has a dark ground with stylesheets ${blocked ? 'blocked' : 'loaded'}`, async ({ page }) => {
        let aborted = 0;
        if (blocked) {
          await page.route('**/*.css', async (route) => {
            aborted++;
            await route.abort();
          });
        }
        await open(page, dark);
        if (blocked) expect(aborted, 'stylesheet requests blocked').toBeGreaterThan(0);
        const ground = await page.evaluate(() => {
          const { kit } = window;
          const html = kit.rgba(getComputedStyle(document.documentElement).backgroundColor);
          const body = kit.rgba(getComputedStyle(document.body).backgroundColor);
          const c = html[3] > 0 ? html : body[3] > 0 ? body : kit.canvasColor();
          const opaque = c[3] < 1 ? kit.over(c, kit.canvasColor()) : c;
          return { hex: kit.hex(opaque), lum: kit.lum(opaque) };
        });
        expect(ground.lum, `ground ${ground.hex}`).toBeLessThanOrEqual(0.05);
      });
    }
  }
});
