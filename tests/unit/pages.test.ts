/**
 * The head, the frame and the variant of every built page: five light pages, their five dark twins
 * under /dark/, and the 404 page.
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { all, attr, one, show } from '../helpers/dom';
import { PAGES, PAGE_CASES, SITE, distPath, page, parsePage, readDist } from '../helpers/dist';
import { DARK_TOKENS, FOOTER_PROMISE, LIGHT_TOKENS, MARK_PATH, NAV, SKIP_LINK, VARIANT_LINK } from '../helpers/spec';
import { textOf, visibleText } from '../helpers/text';

/** A link's label is its text without the page number in front: "110Callout" reads "Callout". */
const labelOf = (text: string): string => text.replace(/^\d{3}\s*/, '');

describe('the site builds every page', () => {
  it.each(PAGES.map((p) => [p.label, p.file] as const))('%s is dist/%s', (_label, file) => {
    expect(existsSync(distPath(file)), `dist/${file} is missing`).toBe(true);
  });
});

describe.each(PAGE_CASES)('%s', (_label, info) => {
  const doc = () => parsePage(info);
  const content = (selector: string): string => attr(one(doc(), selector), 'content') ?? '';
  const dark = info.variant === 'dark';

  describe('head', () => {
    it('starts with a doctype and declares lang="en", charset and viewport', () => {
      expect(readDist(info.file).trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true);
      expect(attr(one(doc(), 'html'), 'lang')).toBe('en');
      expect(attr(one(doc(), 'meta[charset]'), 'charset')?.toLowerCase()).toBe('utf-8');
      expect(content('meta[name="viewport"]')).toBe('width=device-width, initial-scale=1');
    });

    it(`has the title "${info.title}"`, () => {
      expect(textOf(one(doc(), 'head title'))).toBe(info.title);
    });

    it('has a description of at least 40 characters, trimmed', () => {
      const description = content('meta[name="description"]');
      expect(description.length).toBeGreaterThanOrEqual(40);
      expect(description).toBe(description.trim());
    });

    it(info.canonical ? `names ${info.canonical} as canonical, and as og:url` : 'has no canonical URL and asks search engines not to index it', () => {
      const canonical = all(doc(), 'link[rel="canonical"]');
      if (!info.canonical) {
        expect(canonical.map(show)).toEqual([]);
        expect(all(doc(), 'meta[property="og:url"]').map(show)).toEqual([]);
        expect(content('meta[name="robots"]')).toBe('noindex');
        return;
      }
      expect(canonical.map((l) => attr(l, 'href'))).toEqual([info.canonical]);
      expect(content('meta[property="og:url"]')).toBe(info.canonical);
      expect(all(doc(), 'meta[name="robots"]').filter((m) => /noindex/i.test(attr(m, 'content') ?? '')).map(show)).toEqual([]);
    });

    it('shares the 1200x630 social card, whose alt text names the skull bunny mark', () => {
      expect(content('meta[property="og:type"]')).toBe('website');
      expect(content('meta[property="og:title"]')).toBe(info.title);
      expect(content('meta[property="og:description"]')).toBe(content('meta[name="description"]'));
      expect(content('meta[property="og:image"]')).toBe(`${SITE}/og.png`);
      expect(content('meta[property="og:image:width"]')).toBe('1200');
      expect(content('meta[property="og:image:height"]')).toBe('630');
      expect(content('meta[property="og:image:alt"]')).toContain('skull bunny mark');
      expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
      expect(content('meta[name="twitter:image"]')).toBe(`${SITE}/og.png`);
    });

    it('links the favicons and the manifest', () => {
      const links = all(doc(), 'link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').map((l) => `${attr(l, 'rel')} ${attr(l, 'href')}`);
      expect(links).toEqual(['icon /favicon.svg', 'icon /favicon.ico', 'apple-touch-icon /apple-touch-icon.png', 'manifest /site.webmanifest']);
    });
  });

  describe(`the ${info.variant} variant`, () => {
    it(`declares color-scheme ${info.variant} and nothing that follows the visitor's OS setting`, () => {
      expect(content('meta[name="color-scheme"]')).toBe(info.variant);
      expect(readDist(info.file)).not.toMatch(/prefers-color-scheme/i);
      for (const meta of all(doc(), 'meta, link')) expect(attr(meta, 'media'), show(meta)).toBeUndefined();
    });

    const paper = dark ? DARK_TOKENS['--paper'] : LIGHT_TOKENS['--paper'];
    it(`colors the browser chrome with its own paper, ${paper}`, () => {
      expect(content('meta[name="theme-color"]').toUpperCase()).toBe(paper);
    });

    it(dark ? 'loads site.css, then dark.css' : 'loads site.css alone', () => {
      const sheets = all(doc(), 'link[rel="stylesheet"]').map((l) => attr(l, 'href'));
      expect(sheets).toEqual(dark ? ['/styles/site.css', '/styles/dark.css'] : ['/styles/site.css']);
    });

    it(dark ? 'paints html dark from an inline style in the head, before any stylesheet arrives' : 'has no inline style block', () => {
      const blocks = all(doc(), 'style');
      if (!dark) {
        expect(blocks.map(show)).toEqual([]);
        return;
      }
      expect(blocks).toHaveLength(1);
      const block = blocks[0]!;
      expect(block.closest('head'), 'the style block is in the head').not.toBeNull();
      const html = /(?:^|\})\s*html\s*\{([^}]*)\}/.exec(block.text)?.[1] ?? '';
      expect(html, block.text).toMatch(new RegExp(`background(?:-color)?\\s*:\\s*${DARK_TOKENS['--paper']}`, 'i'));
      const order = readDist(info.file);
      expect(order.indexOf('<style'), 'the inline style comes before the first stylesheet link').toBeLessThan(order.indexOf('rel="stylesheet"'));
    });

    it(`links "${VARIANT_LINK[info.variant]}" to ${info.twin}`, () => {
      const links = all(doc(), 'a[href]').filter((a) => visibleText(a) === VARIANT_LINK[info.variant]);
      expect(links.length, `no "${VARIANT_LINK[info.variant]}" link`).toBeGreaterThan(0);
      expect(new Set(links.map((a) => attr(a, 'href')))).toEqual(new Set([info.twin]));
    });
  });

  describe('frame', () => {
    it(`has one h1, inside main, reading "${info.h1}"`, () => {
      expect(all(doc(), 'h1')).toHaveLength(1);
      expect(visibleText(one(doc(), 'main h1'))).toBe(info.h1);
    });

    it('has no empty headings', () => {
      expect(all(doc(), 'h1, h2, h3, h4, h5, h6').filter((h) => visibleText(h) === '').map(show)).toEqual([]);
    });

    it(`opens the body with a skip link to ${SKIP_LINK.href}, which exists`, () => {
      const first = all(doc(), 'body a[href], body button')[0];
      expect(first && visibleText(first)).toBe(SKIP_LINK.label);
      expect(first && attr(first, 'href')).toBe(SKIP_LINK.href);
      expect(one(doc(), 'main').getAttribute('id')).toBe('main');
      expect(all(doc(), '#main')).toHaveLength(1);
    });

    it('draws the skull bunny mark in the header link home, pixel for pixel', () => {
      const marks = all(doc(), 'header a[href]').filter((a) => a.querySelector('svg'));
      expect(marks.map((a) => attr(a, 'href'))).toEqual([dark ? '/dark/' : '/']);
      const svg = one(marks[0]!, 'svg');
      expect(attr(svg, 'shape-rendering')).toBe('crispEdges');
      expect(all(svg, 'path').map((p) => attr(p, 'd'))).toEqual([MARK_PATH]);
    });

    it('links Callout, Vivary, About and Contact from the header nav, in that order, in its own variant', () => {
      const links = all(doc(), 'header nav a');
      expect(links.map((a) => labelOf(visibleText(a)))).toEqual(NAV.map((n) => n.label));
      expect(links.map((a) => attr(a, 'href'))).toEqual(NAV.map((n) => (dark ? `/dark${n.path}` : n.path)));
    });

    it(info.id === 'not-found' ? 'marks no page as current' : 'marks only its own page as current', () => {
      const current = all(doc(), 'header [aria-current="page"]').map((a) => attr(a, 'href'));
      expect(current).toEqual(info.id === 'not-found' ? [] : [info.url]);
    });

    it('keeps its promise in the footer', () => {
      const footers = all(doc(), 'footer').filter((f) => !f.closest('main'));
      expect(footers).toHaveLength(1);
      expect(visibleText(footers[0]!)).toContain(FOOTER_PROMISE);
    });
  });
});

describe('the dark pages', () => {
  it.each(PAGES.filter((p) => p.variant === 'dark').map((p) => [p.label, p] as const))('%s shows the same h1 and title as its light page', (_label, info) => {
    const light = page(info.shows!);
    expect(info.twin).toBe(light.url);
    expect(textOf(one(parsePage(info), 'head title'))).toBe(textOf(one(parsePage(light), 'head title')));
    expect(visibleText(one(parsePage(info), 'h1'))).toBe(visibleText(one(parsePage(light), 'h1')));
  });
});

describe('the html element', () => {
  it.each(PAGE_CASES)('of %s has no data-season attribute, since the holiday overlay is off', (_label, info) => {
    expect(attr(one(parsePage(info), 'html'), 'data-season')).toBeUndefined();
  });
});
