/**
 * The keyboard path on every light and dark page. The first Tab lands on the skip link and shows it,
 * Enter moves the page to main so the next Tab lands inside it, and Tab then visits every link in DOM
 * order, each drawing an outline that stands out from what is behind it.
 */
import { SKIP_LINK } from '../helpers/spec';
import { KEY_WIDTHS, PAGES, VIEWPORT_HEIGHT, expect, focused, open, signature, tabStops, test } from './support';

for (const width of KEY_WIDTHS) {
  test.describe(`keyboard at ${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const info of PAGES) {
      test.describe(info.label, () => {
        test('the first Tab focuses the skip link, on screen and on top', async ({ page }) => {
          await open(page, info);
          await page.keyboard.press('Tab');
          const skip = page.getByRole('link', { name: SKIP_LINK.label });
          await expect(skip).toBeFocused();
          await expect(skip).toHaveAttribute('href', SKIP_LINK.href);
          await expect(skip).toBeVisible();
          expect((await focused(page))?.inView, 'the skip link is inside the viewport when focused').toBe(true);
          const covered = await skip.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return top !== el && !el.contains(top);
          });
          expect(covered, 'something sits on top of the skip link').toBe(false);
        });

        test('Enter on the skip link moves the page to main, and the next Tab lands on the first link in main', async ({ page }) => {
          await open(page, info);
          await page.keyboard.press('Tab');
          await page.keyboard.press('Enter');
          expect(await page.evaluate(() => location.hash)).toBe(SKIP_LINK.href);
          await page.keyboard.press('Tab');
          const landed = await page.evaluate(() => ({
            first: document.activeElement === document.querySelector('main a[href]'),
            text: (document.activeElement?.textContent ?? '').trim().slice(0, 40),
          }));
          expect(landed.first, `focus is on "${landed.text}", not the first link in main`).toBe(true);
        });

        test('Tab visits every link in DOM order, each with a visible outline', async ({ page }) => {
          await open(page, info);
          const expected = await tabStops(page);
          expect(expected.length, 'links to Tab through').toBeGreaterThan(10);
          const seen: string[] = [];
          const bad: string[] = [];
          for (let i = 0; i < expected.length; i++) {
            await page.keyboard.press('Tab');
            const f = await focused(page);
            if (!f) {
              bad.push(`Tab ${i + 1} left focus on the body`);
              break;
            }
            seen.push(signature(f));
            const label = `${f.tag} "${f.text.slice(0, 40)}" ${f.href ?? ''}`;
            if (!f.focusVisible) bad.push(`${label}: not :focus-visible after Tab`);
            if (!f.seen) bad.push(`${label}: focused but not visible`);
            if (!f.outlined) bad.push(`${label}: outline ${f.outline}`);
          }
          expect(bad).toEqual([]);
          expect(seen, 'Tab order against DOM order').toEqual(expected);
          expect(await page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').count(), 'no positive tabindex').toBe(0);
        });
      });
    }
  });
}
