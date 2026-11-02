/**
 * Touch targets on the two busiest pages and their dark twins, at every width the key measures.
 * Every link and button is at least 44 by 44 px, except a link inside a sentence of running text,
 * whose size the line of text sets. WCAG target size rules make the same exception.
 */
import { page as pageOf } from '../helpers/dist';
import { VIEWPORT_HEIGHT, WIDTHS, expect, open, test } from './support';

const MIN = 44;
const PAGES = [pageOf('home'), pageOf('vivary'), pageOf('dark-home'), pageOf('dark-vivary')];

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const info of PAGES) {
      test(`${info.label}: every link and button outside running text is at least ${MIN} by ${MIN} px`, async ({ page }) => {
        await open(page, info);
        const small = await page.evaluate((min) => {
          // A sentence of running text: the link renders inline, its nearest block is a paragraph, list
          // item, definition, table cell, quote or caption laid out as flow, and that block shows at
          // least two words outside its links. A flex row of controls is not a sentence.
          const PROSE = new Set(['P', 'LI', 'DD', 'TD', 'BLOCKQUOTE', 'FIGCAPTION']);
          const inSentence = (a: Element): boolean => {
            if (!getComputedStyle(a).display.startsWith('inline')) return false;
            let block = a.parentElement;
            while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
            if (!block || !PROSE.has(block.tagName) || !['block', 'list-item', 'table-cell'].includes(getComputedStyle(block).display)) return false;
            let words = 0;
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
            for (let t = walker.nextNode(); t; t = walker.nextNode()) {
              const parent = t.parentElement;
              if (parent && !parent.closest('a, button') && window.kit.seen(parent)) words += ((t.textContent ?? '').match(/\p{L}{2,}/gu) ?? []).length;
            }
            return words >= 2;
          };
          const out: string[] = [];
          for (const el of document.querySelectorAll('a[href], button')) {
            if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
            const r = el.getBoundingClientRect();
            if ((r.width === 0 && r.height === 0) || (r.width >= min && r.height >= min)) continue;
            if (el.matches('a[href]') && inSentence(el)) continue;
            out.push(`${window.kit.where(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return out;
        }, MIN);
        expect(small).toEqual([]);
      });
    }
  });
}
