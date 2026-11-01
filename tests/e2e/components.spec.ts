/**
 * The components as the browser renders them: buttons, status badges, the now line, plates, links,
 * lanes and the nav, with the token colors of each scheme. Run at a desktop and a phone width.
 */
import { CALLOUT_PLATE, FOOTER, HOME, SKIP_LINK, VIVARY_PAGE } from '../helpers/spec';
import { NAV_LINKS } from '../helpers/dist';
import { KEY_WIDTHS, SCHEMES, VIEWPORT_HEIGHT, box, countHairlines, expect, firstFamily, isPhone, open, rgb, round, style, test } from './support';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const [getCallout, seeVivary] = HOME.buttons;
const [vivaryNav, aboutNav] = [NAV_LINKS[1], NAV_LINKS[2]];

for (const scheme of SCHEMES) {
  for (const width of KEY_WIDTHS) {
    const phone = isPhone(width);
    test.describe(`components, ${scheme} ${width}px`, () => {
      test.use({ viewport: { width, height: VIEWPORT_HEIGHT }, colorScheme: scheme });

      test.describe('buttons', () => {
        test('primary: accent-fill ground, on-accent label, 2px radius, 15px semibold', async ({ page }) => {
          await open(page, '/');
          const s = await style(page.getByRole('link', { name: getCallout.label }), [
            'background-color', 'color', 'border-top-left-radius', 'border-top-width', 'border-top-color', 'font-size', 'font-weight', 'text-decoration-line', 'font-family', 'box-shadow',
          ]);
          expect(s['background-color']).toBe(rgb(scheme, 'accent-fill'));
          expect(s['color']).toBe(rgb(scheme, 'on-accent'));
          expect(s['border-top-left-radius']).toBe('2px');
          expect(s['font-size']).toBe('15px');
          expect(s['font-weight']).toBe('600');
          expect(s['text-decoration-line']).toBe('none');
          expect(firstFamily(s['font-family'])).toBe('Instrument Sans');
          expect(s['box-shadow']).toBe('none');
        });

        test('secondary: clear ground, 1px field border, ink label, 2px radius', async ({ page }) => {
          await open(page, '/');
          const s = await style(page.getByRole('link', { name: seeVivary.label }), [
            'background-color', 'color', 'border-top-left-radius', 'border-top-width', 'border-top-style', 'border-top-color', 'font-size', 'font-weight',
          ]);
          expect(s['background-color']).toBe(TRANSPARENT);
          expect(s['color']).toBe(rgb(scheme, 'ink'));
          expect(s['border-top-width']).toBe('1px');
          expect(s['border-top-style']).toBe('solid');
          expect(s['border-top-color']).toBe(rgb(scheme, 'field'));
          expect(s['border-top-left-radius']).toBe('2px');
          expect(s['font-size']).toBe('15px');
          expect(s['font-weight']).toBe('600');
        });

        test('md buttons are at least 46px tall and sm buttons at least 40px', async ({ page }) => {
          await open(page, '/');
          expect((await box(page.getByRole('link', { name: getCallout.label }))).height).toBeGreaterThanOrEqual(phone ? 48 : 46);
          expect((await box(page.getByRole('link', { name: HOME.vivary.button.label }))).height).toBeGreaterThanOrEqual(40);
          expect((await box(page.getByRole('link', { name: HOME.callout.button.label }))).height).toBeGreaterThanOrEqual(40);
        });

        test('primary turns accent-hover on hover, secondary draws an ink border', async ({ page }) => {
          test.skip(phone, 'hover is a desktop pointer interaction');
          await open(page, '/');
          const primary = page.getByRole('link', { name: getCallout.label });
          await primary.hover();
          await expect.poll(async () => (await style(primary, ['background-color']))['background-color']).toBe(rgb(scheme, 'accent-hover'));
          const secondary = page.getByRole('link', { name: seeVivary.label });
          await secondary.hover();
          await expect.poll(async () => (await style(secondary, ['border-top-color']))['border-top-color']).toBe(rgb(scheme, 'ink'));
        });

        test('hover changes color only: nothing moves or resizes', async ({ page }) => {
          test.skip(phone, 'hover is a desktop pointer interaction');
          await open(page, '/');
          const primary = page.getByRole('link', { name: getCallout.label });
          const before = await box(primary);
          await primary.hover();
          // The color change has finished once the hover color is the computed one and no transition is left running.
          await expect.poll(async () => (await style(primary, ['background-color']))['background-color']).toBe(rgb(scheme, 'accent-hover'));
          await expect.poll(() => primary.evaluate((el) => el.getAnimations().length), { message: 'transitions still running' }).toBe(0);
          expect(await box(primary)).toEqual(before);
        });
      });

      test.describe('status badges and the now line', () => {
        test('now line: 8px status-wip dot as ::before, then the sentence in ink-soft 15px', async ({ page }) => {
          await open(page, '/');
          const now = page.locator('section.hero p.now');
          const dot = await style(now, ['width', 'height', 'background-color', 'border-top-left-radius', 'content', 'display'], '::before');
          expect(dot['content']).not.toBe('none');
          expect(dot['width']).toBe('8px');
          expect(dot['height']).toBe('8px');
          expect(dot['background-color']).toBe(rgb(scheme, 'status-wip'));
          expect(dot['border-top-left-radius']).toBe('50%');
          const text = await style(now, ['color', 'font-size', 'font-family']);
          expect(text['color']).toBe(rgb(scheme, 'ink-soft'));
          expect(text['font-size']).toBe('15px');
          expect(firstFamily(text['font-family'])).toBe('Instrument Sans');
        });

        test('badge label: 13px semibold ink-soft; the dot is 7px', async ({ page }) => {
          await open(page, '/');
          const badge = page.locator('section#work .status').first();
          const s = await style(badge, ['color', 'font-size', 'font-weight', 'font-family']);
          expect(s['color']).toBe(rgb(scheme, 'ink-soft'));
          expect(s['font-size']).toBe('13px');
          expect(s['font-weight']).toBe('600');
          expect(firstFamily(s['font-family'])).toBe('Instrument Sans');
          const dot = await style(badge.locator('i'), ['width', 'height', 'border-top-left-radius']);
          expect(dot['width']).toBe('7px');
          expect(dot['height']).toBe('7px');
          expect(dot['border-top-left-radius']).toBe('50%');
        });

        test('the middle dot in a badge is a separator with a margin of .15em on each side of the spaces the text has, which sets the dot .35em from each word', async ({ page }) => {
          await open(page, '/');
          const badge = page.locator('section#work .status--wip');
          const sep = await style(badge.locator('.sep').first(), ['margin-left', 'margin-right', 'font-size', 'white-space']);
          const em = parseFloat(sep['font-size'] ?? '0');
          expect(parseFloat(sep['margin-left'] ?? '0')).toBeCloseTo(0.15 * em, 1);
          expect(parseFloat(sep['margin-right'] ?? '0')).toBeCloseTo(0.15 * em, 1);
          expect(sep['white-space'], 'a line never starts with the dot').toBe('nowrap');
          expect(await badge.textContent(), 'the text has an ordinary space on each side of the dot').toContain('Beta · v0.1.0-beta.1 · Nov');
          // Where the ink is: from the last letter before the dot to the dot, and from the dot to the first letter after it.
          const gaps = await badge.locator('.sep').first().evaluate((el) => {
            const [before, after] = [el.previousSibling, el.nextSibling];
            const dotNode = el.firstChild;
            if (!(before instanceof Text) || !(after instanceof Text) || !(dotNode instanceof Text)) throw new Error('the dot is not set between two pieces of text');
            const charBox = (node: Text, index: number): DOMRect => {
              const range = document.createRange();
              range.setStart(node, index);
              range.setEnd(node, index + 1);
              return range.getBoundingClientRect();
            };
            const dot = charBox(dotNode, dotNode.data.indexOf('·'));
            const last = charBox(before, before.data.trimEnd().length - 1);
            const first = charBox(after, after.data.length - after.data.trimStart().length);
            return { left: dot.left - last.right, right: first.left - dot.right, em: parseFloat(getComputedStyle(el).fontSize) };
          });
          expect(gaps.left / gaps.em, `${round(gaps.left)}px before the dot`).toBeGreaterThan(0.3);
          expect(gaps.left / gaps.em).toBeLessThan(0.4);
          expect(Math.abs(gaps.left - gaps.right) / gaps.em, `${round(gaps.left)}px before the dot, ${round(gaps.right)}px after it`).toBeLessThan(0.03);
        });

        test('shipped and wip dots are filled with status-live and status-wip', async ({ page }) => {
          await open(page, '/');
          const wip = await style(page.locator('section#work .status--wip i'), ['background-color']);
          const shipped = await style(page.locator('section#work .status--shipped i'), ['background-color']);
          expect(wip['background-color']).toBe(rgb(scheme, 'status-wip'));
          expect(shipped['background-color']).toBe(rgb(scheme, 'status-live'));
        });

        test('alpha and demo dots are rings, not fills', async ({ page }) => {
          await open(page, '/');
          for (const tone of ['alpha', 'demo']) {
            const dot = await style(page.locator(`section#other .status--${tone} i`).first(), ['background-color', 'box-shadow', 'border-top-width']);
            expect(dot['background-color'], `${tone} dot is hollow`).toBe(TRANSPARENT);
            expect(dot['box-shadow'] !== 'none' || dot['border-top-width'] !== '0px', `${tone} dot has a ring`).toBe(true);
          }
        });

        test('the shipped project badge says Shipped with the live dot', async ({ page }) => {
          await open(page, '/');
          const badge = page.locator('section#other .status--shipped').first();
          await expect(badge).toHaveText('Shipped');
          expect((await style(badge.locator('i'), ['background-color']))['background-color']).toBe(rgb(scheme, 'status-live'));
        });
      });

      test.describe('plates', () => {
        test('a Plate is a raised, square frame with a 1px rule and 14px (8px on a phone) padding', async ({ page }) => {
          await open(page, '/');
          const s = await style(page.locator('section#work figure.plate').first(), [
            'background-color', 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius', 'padding-top', 'padding-left', 'box-shadow',
          ]);
          expect(s['background-color']).toBe(rgb(scheme, 'raised'));
          expect(`${s['border-top-width']} ${s['border-top-style']} ${s['border-top-color']}`).toBe(`1px solid ${rgb(scheme, 'rule')}`);
          expect(s['border-top-left-radius']).toBe('0px');
          expect(s['padding-top']).toBe(phone ? '8px' : '14px');
          expect(s['padding-left']).toBe(phone ? '8px' : '14px');
          expect(s['box-shadow']).toBe('none');
        });

        test('the picture fills the plate and the caption sits under it in ink-faint italic', async ({ page }) => {
          await open(page, '/');
          const plate = page.locator('section#work figure.plate').first();
          const img = await box(plate.locator('img'));
          const frame = await box(plate);
          const padding = phone ? 8 : 14;
          expect(Math.abs(img.width - (frame.width - 2 * padding - 2)), 'picture fills the frame').toBeLessThanOrEqual(1.5);
          const caption = await style(plate.locator('figcaption'), ['color', 'font-size', 'font-family', 'font-style', 'font-weight']);
          expect(caption['color']).toBe(rgb(scheme, 'ink-faint'));
          expect(caption['font-size']).toBe(phone ? '15px' : '17px');
          expect(firstFamily(caption['font-family'])).toBe('Instrument Serif Italic');
          expect(caption['font-style'], 'the italic is its own family, so the style stays normal').toBe('normal');
          expect(caption['font-weight']).toBe('400');
          expect((await box(plate.locator('figcaption'))).y).toBeGreaterThanOrEqual(img.bottom);
        });

        test('the facts plate wears the same frame', async ({ page }) => {
          await open(page, '/');
          const plate = page.locator('section#work article.feature').nth(1).locator('.media .plate');
          const s = await style(plate, ['background-color', 'border-top-width', 'border-top-color', 'border-top-left-radius', 'padding-top']);
          expect(s['background-color']).toBe(rgb(scheme, 'raised'));
          expect(s['border-top-width']).toBe('1px');
          expect(s['border-top-color']).toBe(rgb(scheme, 'rule'));
          expect(s['border-top-left-radius']).toBe('0px');
          expect(s['padding-top']).toBe(phone ? '8px' : '14px');
        });

        test('the facts plate rules its rows with hairlines, sets the label column at 6.5rem or less, and sets the quote upright in the display face with the italic caption under it', async ({ page }) => {
          await open(page, '/');
          const feature = page.locator('section#work article.feature').nth(1);
          const hairlines = await countHairlines(feature.locator('dl').first(), rgb(scheme, 'rule'));
          expect(hairlines, `hairlines between the ${CALLOUT_PLATE.rows.length} rows`).toBeGreaterThanOrEqual(CALLOUT_PLATE.rows.length - 1);
          const label = await box(feature.locator('dl dt').first());
          const value = await box(feature.locator('dl dd').first());
          expect(label.width, 'label column').toBeLessThanOrEqual(104.5);
          expect(value.x, 'value starts after the label column').toBeGreaterThan(label.right);
          const quote = await style(feature.getByText(CALLOUT_PLATE.quoteShown, { exact: true }), ['font-family', 'font-style', 'font-size', 'color']);
          expect(firstFamily(quote['font-family'] ?? '')).toBe('Instrument Serif');
          expect(quote['font-style']).toBe('normal');
          expect(quote['font-size']).toBe('24px');
          expect(quote['color']).toBe(rgb(scheme, 'ink'));
          const credit = await style(feature.getByText(CALLOUT_PLATE.quoteCaption, { exact: true }), ['font-family', 'color']);
          expect(firstFamily(credit['font-family'] ?? '')).toBe('Instrument Serif Italic');
          expect(credit['color']).toBe(rgb(scheme, 'ink-faint'));
        });
      });

      test.describe('type and color', () => {
        test('the numeral is italic Instrument Serif in the accent color', async ({ page }) => {
          await open(page, '/');
          const s = await style(page.locator('section#work p.numeral').first(), ['color', 'font-family', 'font-style', 'font-size', 'font-weight']);
          expect(s['color']).toBe(rgb(scheme, 'accent'));
          expect(firstFamily(s['font-family'])).toBe('Instrument Serif Italic');
          expect(s['font-style']).toBe('normal');
          expect(s['font-weight']).toBe('400');
          expect(parseFloat(s['font-size'] ?? '0')).toBeGreaterThanOrEqual(15);
          expect(parseFloat(s['font-size'] ?? '0')).toBeLessThanOrEqual(22);
        });

        test('the lede and the lane details are ink-soft, headings and lane names are ink', async ({ page }) => {
          await open(page, '/');
          expect((await style(page.locator('section.hero .lede'), ['color']))['color']).toBe(rgb(scheme, 'ink-soft'));
          expect((await style(page.locator('section#how dd').first(), ['color']))['color']).toBe(rgb(scheme, 'ink-soft'));
          expect((await style(page.locator('section#work h2').first(), ['color']))['color']).toBe(rgb(scheme, 'ink'));
          expect((await style(page.locator('section#other h2'), ['color']))['color']).toBe(rgb(scheme, 'ink'));
          expect((await style(page.locator('section#other h3').first(), ['color']))['color']).toBe(rgb(scheme, 'ink'));
          expect((await style(page.locator('section#how dt').first(), ['color']))['color']).toBe(rgb(scheme, 'ink'));
        });

        test('project address links are ink with an accent underline', async ({ page }) => {
          await open(page, '/');
          const s = await style(page.locator('section#other li.entry').first().getByRole('link'), ['color', 'text-decoration-line', 'text-decoration-color']);
          expect(s['color']).toBe(rgb(scheme, 'ink'));
          expect(s['text-decoration-line']).toBe('underline');
          expect(s['text-decoration-color']).toBe(rgb(scheme, 'accent'));
        });

        test('inline links in prose carry an accent underline too', async ({ page }) => {
          await open(page, '/vivary/');
          const link = page.getByRole('link', { name: VIVARY_PAGE.statusSection.links[1].label, exact: true });
          const s = await style(link, ['text-decoration-line', 'text-decoration-color']);
          expect(s['text-decoration-line']).toBe('underline');
          expect(s['text-decoration-color']).toBe(rgb(scheme, 'accent'));
        });

        test('text selection uses the selection token', async ({ page }) => {
          await open(page, '/');
          const bg = await page.evaluate(() => {
            const p = document.querySelector('section.hero .lede') as HTMLElement;
            const style = getComputedStyle(p, '::selection');
            return { background: style.backgroundColor, color: style.color };
          });
          expect(bg.background).toBe(rgb(scheme, 'selection'));
          expect(bg.color).toBe(rgb(scheme, 'ink'));
        });
      });

      test.describe('navigation and footer colors', () => {
        test('nav links: ink-soft, 15px; the current page is ink with an accent underline', async ({ page }) => {
          await open(page, '/about/');
          const nav = page.getByRole('navigation', { name: 'Main' });
          const other = await style(nav.getByRole('link', { name: vivaryNav.label, exact: true }), ['color', 'font-size', 'font-family', 'text-decoration-line']);
          expect(other['color']).toBe(rgb(scheme, 'ink-soft'));
          expect(other['font-size']).toBe('15px');
          expect(firstFamily(other['font-family'])).toBe('Instrument Sans');
          expect(other['text-decoration-line']).toBe('none');
          const current = await style(nav.getByRole('link', { name: aboutNav.label, exact: true }), ['color', 'text-decoration-line', 'text-decoration-color']);
          expect(current['color']).toBe(rgb(scheme, 'ink'));
          expect(current['text-decoration-line']).toBe('underline');
          expect(current['text-decoration-color']).toBe(rgb(scheme, 'accent'));
        });

        test('footer: ground-alt band, ink-faint 13px text, ink-soft links', async ({ page }) => {
          await open(page, '/');
          const footer = page.getByRole('contentinfo');
          const s = await style(footer, ['background-color', 'color', 'font-size', 'font-family']);
          expect(s['background-color']).toBe(rgb(scheme, 'ground-alt'));
          expect(s['color']).toBe(rgb(scheme, 'ink-faint'));
          expect(s['font-size']).toBe('13px');
          for (const { label: name } of FOOTER.links) {
            expect((await style(footer.getByRole('link', { name }), ['color']))['color'], name).toBe(rgb(scheme, 'ink-soft'));
          }
        });

        test('the skip link is out of reach of a pointer until it has focus, then sits on screen', async ({ page }) => {
          await open(page, '/');
          const skip = page.getByRole('link', { name: SKIP_LINK.label });
          // Clipped or off-screen, nothing at the link's own position belongs to it until it has focus.
          const reachable = await skip.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return hit === el || el.contains(hit);
          });
          expect(reachable, 'the skip link should be off-screen or clipped until it has focus').toBe(false);
          await page.keyboard.press('Tab');
          const focused = await box(skip);
          expect(focused.x).toBeGreaterThanOrEqual(0);
          expect(focused.y).toBeGreaterThanOrEqual(0);
          expect(focused.width).toBeGreaterThan(40);
        });
      });

      test.describe('lanes', () => {
        test('names are display titles (28px, 24px on a phone), details are body text', async ({ page }) => {
          await open(page, '/');
          const dt = await style(page.locator('section#how dt').first(), ['font-size', 'font-family', 'font-weight']);
          expect(dt['font-size']).toBe(phone ? '24px' : '28px');
          expect(firstFamily(dt['font-family'])).toBe('Instrument Serif');
          expect(dt['font-weight']).toBe('400');
          const dd = await style(page.locator('section#how dd').first(), ['font-size', 'font-family']);
          expect(dd['font-size']).toBe('16px');
          expect(firstFamily(dd['font-family'])).toBe('Instrument Sans');
        });
      });
    });
  }
}

// Forced colors repaint every background as the page color, so what is only a background has to get a border.
for (const scheme of SCHEMES) {
  test.describe(`forced colors, ${scheme}`, () => {
    test.use({ viewport: { width: 1280, height: VIEWPORT_HEIGHT }, colorScheme: scheme, contextOptions: { forcedColors: 'active' } });

    test('a filled status dot has a border and so does the dot of the now line, and a hollow dot stays a thinner ring', async ({ page }) => {
      await open(page, '/');
      const filled = await style(page.locator('section#work .status--wip i'), ['border-top-width']);
      const hollow = await style(page.locator('section#other .status--alpha i').first(), ['border-top-width']);
      const now = await style(page.locator('section.hero .now'), ['border-top-width'], '::before');
      expect(filled['border-top-width']).toBe('4px');
      expect(parseFloat(hollow['border-top-width'] ?? '0'), 'a ring, thinner than the filled dot').toBeLessThan(2);
      expect(now['border-top-width']).toBe('4px');
    });

    test('the primary button has a 2px border and the secondary one a 1px border, so they differ', async ({ page }) => {
      await open(page, '/');
      const primary = await style(page.getByRole('link', { name: getCallout.label }), ['border-top-width']);
      const secondary = await style(page.getByRole('link', { name: seeVivary.label }), ['border-top-width']);
      expect(primary['border-top-width']).toBe('2px');
      expect(secondary['border-top-width']).toBe('1px');
    });
  });
}
