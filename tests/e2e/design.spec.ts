/**
 * Direction K as the browser renders it, on every light and dark page: the tokens compute to the
 * approved values, every piece of text meets WCAG AA against what is behind it, corners are square,
 * nothing is blurred, gradients are only halftone dots, and the pixel face VT323 is never set small.
 */
import { DARK_TOKENS, LIGHT_TOKENS, VT323_MIN_PX } from '../helpers/spec';
import { PAGES, expect, open, test } from './support';

test.use({ viewport: { width: 1440, height: 900 } });

for (const info of PAGES) {
  test.describe(info.label, () => {
    test(`computes the ${info.variant} tokens to the approved values`, async ({ page }) => {
      await open(page, info);
      const want = info.variant === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
      const got = await page.evaluate(
        (names) =>
          Object.fromEntries(
            names.map((n) => {
              const value = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
              return [n, value && CSS.supports('color', value) ? window.kit.hex(window.kit.rgba(value)) : value];
            }),
          ),
        Object.keys(want),
      );
      expect(got).toEqual(want);
    });

    test('sets every visible piece of text at WCAG AA contrast against what is behind it', async ({ page }) => {
      await open(page, info);
      const pink = LIGHT_TOKENS['--pink'];
      const paper = LIGHT_TOKENS['--paper'];
      const found = await page.evaluate(() =>
        window.kit.texts(false).map(({ text, el }) => {
          const { kit } = window;
          const cs = getComputedStyle(el);
          const ground = kit.behind(el);
          const fg = kit.over(kit.rgba(cs.color), ground);
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          return { text, ratio: kit.ratio(fg, ground), min: large ? 3 : 4.5, fg: kit.hex(fg), ground: kit.hex(ground) };
        }),
      );
      expect(found.length, 'visible text found').toBeGreaterThan(10);
      expect(found.filter((t) => t.ratio < t.min).map((t) => `"${t.text}" ${t.ratio.toFixed(2)}:1 < ${t.min}:1, ${t.fg} on ${t.ground}`)).toEqual([]);
      if (info.variant === 'light') {
        expect(found.filter((t) => t.fg === pink && t.ground === paper).map((t) => `"${t.text}" is --pink on --paper, use --pink-text`)).toEqual([]);
      }
    });

    test('has square corners, no blur, and no gradient but halftone dots', async ({ page }) => {
      await open(page, info);
      const found = await page.evaluate(() => {
        const out: string[] = [];
        const blurred = (shadow: string): boolean =>
          shadow
            .split(/,(?![^(]*\))/)
            .map((s) => s.replace(/[a-z-]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? [])
            .some((lengths) => parseFloat(lengths[2] ?? '0') > 0);
        // Halftone dots repeat on a small tile. A gradient over a whole box is a fade.
        const smallTile = (size: string): boolean => size.split(',').every((s) => /^\s*[\d.]+px(\s+[\d.]+px)?\s*$/.test(s) && (s.match(/[\d.]+/g) ?? []).every((v) => parseFloat(v) <= 32));
        for (const el of document.querySelectorAll('html, body, body *')) {
          for (const pseudo of ['', '::before', '::after']) {
            const cs = getComputedStyle(el, pseudo || null);
            if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
            const at = window.kit.where(el, pseudo);
            if ([cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].some((r) => r !== '0px')) out.push(`${at} border-radius ${cs.borderRadius}`);
            if (cs.boxShadow !== 'none' && blurred(cs.boxShadow)) out.push(`${at} box-shadow ${cs.boxShadow}`);
            if (cs.textShadow !== 'none' && blurred(cs.textShadow)) out.push(`${at} text-shadow ${cs.textShadow}`);
            if (/blur\(/.test(cs.filter) || /blur\(/.test(cs.backdropFilter)) out.push(`${at} blurs`);
            if (/(?:linear|conic)-gradient/.test(cs.backgroundImage)) out.push(`${at} ${cs.backgroundImage.slice(0, 60)}`);
            if (/radial-gradient/.test(cs.backgroundImage) && !smallTile(cs.backgroundSize)) out.push(`${at} radial-gradient on a ${cs.backgroundSize} tile`);
          }
        }
        return [...new Set(out)];
      });
      expect(found).toEqual([]);
    });

    test(`never sets VT323 below ${VT323_MIN_PX}px, decoration included`, async ({ page }) => {
      await open(page, info);
      const found = await page.evaluate(() =>
        window.kit
          .texts(true)
          .map(({ text, el }) => ({ text, cs: getComputedStyle(el) }))
          .filter(({ cs }) => window.kit.firstFamily(cs) === 'VT323')
          .map(({ text, cs }) => ({ text, size: parseFloat(cs.fontSize) })),
      );
      expect(found.length, 'text set in VT323').toBeGreaterThan(5);
      expect(found.filter((t) => t.size < VT323_MIN_PX).map((t) => `"${t.text}" ${t.size}px`)).toEqual([]);
    });
  });
}
