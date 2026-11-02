/**
 * Every page, light and dark, at every width the key measures. A visitor on a phone or a desktop gets
 * a page that loads cleanly, talks only to this server, fits the screen, sets its text in the three
 * self-hosted fonts and paints the paper and ink of its variant.
 *
 * One test, and so one page load, per cell. The checks are soft, so a failing cell reports
 * everything that is wrong with it at once.
 */
import { toRgbString } from '../helpers/color';
import { BODY_FAMILY, DARK_TOKENS, FONT_FAMILIES, LIGHT_TOKENS } from '../helpers/spec';
import { PAGES, VIEWPORT_HEIGHT, WIDTHS, expect, open, test } from './support';

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const info of PAGES) {
      test(`${info.label}: loads cleanly, fits, and wears its variant and fonts`, async ({ page, probe, baseURL }) => {
        await open(page, info);

        await test.step('no console or page errors, no failed or 4xx or 5xx requests, no request to another origin', async () => {
          expect.soft(probe.pageErrors, 'page errors').toEqual([]);
          expect.soft(probe.consoleErrors, 'console errors').toEqual([]);
          expect.soft(probe.failedRequests, 'failed requests').toEqual([]);
          expect.soft(probe.badResponses, '4xx or 5xx responses').toEqual([]);
          expect.soft(probe.foreignRequests, 'requests to another origin').toEqual([]);
        });

        await test.step('no horizontal scroll', async () => {
          const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
            const limit = document.documentElement.clientWidth;
            const offenders = Array.from(document.querySelectorAll('body *'))
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.right > limit + 0.5 || r.left < -0.5);
              })
              .slice(0, 8)
              .map((el) => window.kit.where(el));
            return { scrollWidth: document.documentElement.scrollWidth, clientWidth: limit, offenders };
          });
          expect.soft(scrollWidth, `scrollWidth ${scrollWidth} > ${clientWidth}. Wide elements: ${offenders.join(', ')}`).toBeLessThanOrEqual(clientWidth);
          expect.soft(offenders, 'no element pokes past the viewport').toEqual([]);
        });

        await test.step('sets its text only in the three fonts, each a woff2 file from this server, with body text in Zen Kaku Gothic New', async () => {
          const fonts = await page.evaluate(() => ({
            body: window.kit.firstFamily(getComputedStyle(document.body)),
            loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/^["']|["']$/g, '')),
            used: [...new Set(window.kit.texts(true).map(({ el }) => window.kit.firstFamily(getComputedStyle(el))))],
          }));
          expect.soft(fonts.body, 'body family').toBe(BODY_FAMILY);
          expect.soft(fonts.loaded, `${BODY_FAMILY} loaded`).toContain(BODY_FAMILY);
          expect.soft(fonts.used.filter((f) => !(FONT_FAMILIES as readonly string[]).includes(f)), 'text in another family').toEqual([]);
          expect.soft(fonts.used.filter((f) => !fonts.loaded.includes(f)), 'text in a family that never loaded').toEqual([]);
          const origin = new URL(baseURL ?? '').origin;
          expect.soft(probe.fonts.filter((f) => f.status !== 200 || !f.url.startsWith(`${origin}/`) || !/\.woff2$/.test(new URL(f.url).pathname)), 'fonts not served as woff2 from this server').toEqual([]);
          expect.soft(probe.fonts.length, 'fonts fetched').toBeGreaterThan(0);
        });

        await test.step(`paints the paper and ink of the ${info.variant} variant`, async () => {
          const tokens = info.variant === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
          const colors = await page.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor, h1: getComputedStyle(document.querySelector('h1')!).color }));
          expect.soft(colors.body, 'body background').toBe(toRgbString(tokens['--paper']));
          expect.soft(colors.h1, 'h1 color').toBe(toRgbString(tokens['--ink']));
        });

        await test.step('nothing moves on its own', async () => {
          expect.soft(await page.evaluate(() => document.getAnimations().length), 'running animations or transitions').toBe(0);
        });
      });
    }
  });
}
