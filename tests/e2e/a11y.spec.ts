/**
 * WCAG 2.2 AA. axe-core reports zero violations on every light and dark page at a phone width and a
 * desktop width, with the rule sets wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa.
 */
import AxeBuilder from '@axe-core/playwright';
import { KEY_WIDTHS, PAGES, VIEWPORT_HEIGHT, expect, formatViolations, open, test } from './support';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const width of KEY_WIDTHS) {
  test.describe(`axe at ${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const info of PAGES) {
      test(`${info.label} has no violations`, async ({ page }) => {
        await open(page, info);
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(results.violations, formatViolations(results.violations)).toEqual([]);
      });
    }
  });
}

test.describe('axe sees the whole page', () => {
  test('runs a meaningful number of rules, with none skipped for lack of a landmark or title', async ({ page }) => {
    await open(page, '/');
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.passes.length, 'axe should have passed plenty of rules').toBeGreaterThan(15);
    const ids = results.passes.map((r) => r.id);
    for (const id of ['document-title', 'html-has-lang', 'link-name', 'color-contrast', 'bypass'] as const) {
      expect(ids, `axe should have checked ${id}`).toContain(id);
    }
  });
});
