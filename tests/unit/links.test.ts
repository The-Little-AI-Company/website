/**
 * Link integrity: every internal link lands on a built file, every fragment exists, everything
 * external is https to a host the site already names, page links stay in their variant, and every
 * page number the site shows leads somewhere.
 */
import { describe, expect, it } from 'vitest';
import { all, attr, show } from '../helpers/dom';
import { PAGE_CASES, SITE, fragmentsIn, parsePage, resolveSitePath, splitHref, srcsetUrls, type PageInfo } from '../helpers/dist';
import { EXTERNAL_NUMBERS, PAGE_TABLE, RETIRED_PAGES, VARIANT_LINK } from '../helpers/spec';
import { visibleText } from '../helpers/text';

/** Every host the copy may link to. A new host is new content, so adding one is a decision for this list. */
const EXTERNAL_HOSTS = new Set([
  'github.com',
  'jeffkazzee.dev',
  'worldfactbook.xyz',
  'llmarcade.fun',
  'puckwork.vercel.app',
  'neon-noir-detective-agency.vercel.app',
  'vivaryagent.xyz',
  'x.com',
  'bsky.app',
]);

interface Reference {
  /** What holds the reference, for messages. */
  from: string;
  href: string;
}

/** Links to follow: anchors, link elements, images and srcset candidates. */
function references(info: PageInfo): Reference[] {
  const doc = parsePage(info);
  const refs: Reference[] = [];
  for (const a of all(doc, 'a[href]')) refs.push({ from: show(a), href: attr(a, 'href') ?? '' });
  // The canonical URL is checked exactly in pages.test.ts.
  for (const l of all(doc, 'link[href]:not([rel="canonical"])')) refs.push({ from: show(l), href: attr(l, 'href') ?? '' });
  for (const i of all(doc, 'img[src]')) refs.push({ from: show(i), href: attr(i, 'src') ?? '' });
  for (const s of all(doc, 'source')) {
    for (const url of srcsetUrls(attr(s, 'srcset') ?? '')) refs.push({ from: show(s), href: url });
  }
  for (const m of all(doc, 'meta[property="og:image"], meta[name="twitter:image"]')) refs.push({ from: show(m), href: attr(m, 'content') ?? '' });
  return refs;
}

const isExternal = (href: string): boolean => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
const isOwnOrigin = (href: string): boolean => href === SITE || href.startsWith(`${SITE}/`);
/** Site-relative form of a same-site reference: `https://littleaicompany.com/og.png` -> `/og.png`. */
const toSitePath = (href: string): string => (isOwnOrigin(href) ? href.slice(SITE.length) || '/' : href);
const isDarkPath = (path: string): boolean => path === '/dark' || path.startsWith('/dark/');
/** A page rather than an asset: a path that ends in a slash, or in no file extension. */
const isPagePath = (path: string): boolean => path.endsWith('/') || !/\.[a-z0-9]+$/i.test(path);

const LIGHT_ROUTES = new Set(PAGE_TABLE.map((p) => p.path));
const DARK_ROUTES = new Set(PAGE_TABLE.map((p) => `/dark${p.path}`));

describe.each(PAGE_CASES)('links on %s', (_label, info) => {
  it('send every internal href to a built file', () => {
    const missing: string[] = [];
    for (const { from, href } of references(info)) {
      const target = toSitePath(href);
      if (isExternal(target) || target.startsWith('#')) continue;
      if (!target.startsWith('/')) {
        missing.push(`${from}: "${href}" is relative, use a site path`);
        continue;
      }
      const { path } = splitHref(target);
      if (!resolveSitePath(path)) missing.push(`${from}: ${href} is not in dist/`);
    }
    expect(missing).toEqual([]);
  });

  it('use a trailing slash for pages, as GitHub Pages serves them', () => {
    const bad: string[] = [];
    for (const { from, href } of references(info)) {
      const target = toSitePath(href);
      if (isExternal(target) || !target.startsWith('/')) continue;
      const { path } = splitHref(target);
      const file = resolveSitePath(path);
      if (file?.endsWith('index.html') && !path.endsWith('/')) bad.push(`${from}: ${href} should end with a slash`);
    }
    expect(bad).toEqual([]);
  });

  it('point every #fragment at an id that exists on the target page', () => {
    const bad: string[] = [];
    const own = fragmentsIn(info.file);
    for (const { from, href } of references(info)) {
      const target = toSitePath(href);
      if (isExternal(target)) continue;
      const { path, fragment } = splitHref(target);
      if (fragment === undefined) continue;
      if (fragment === '') {
        bad.push(`${from}: "${href}" is an empty fragment`);
        continue;
      }
      const file = path === '' ? info.file : resolveSitePath(path);
      if (!file) continue; // reported by the first test
      const ids = path === '' ? own : fragmentsIn(file);
      if (!ids.has(decodeURIComponent(fragment))) bad.push(`${from}: #${fragment} does not exist in ${file}`);
    }
    expect(bad).toEqual([]);
  });

  it('use https for every external link, or mailto', () => {
    const bad: string[] = [];
    for (const { from, href } of references(info)) {
      if (!isExternal(href) || isOwnOrigin(href)) continue;
      if (href.startsWith('mailto:')) {
        if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) bad.push(`${from}: malformed ${href}`);
        continue;
      }
      if (!URL.canParse(href) || !href.startsWith('https://')) bad.push(`${from}: ${href} is not an https URL`);
    }
    expect(bad).toEqual([]);
  });

  it('link only to hosts the site already names', () => {
    const bad: string[] = [];
    for (const { from, href } of references(info)) {
      if (!href.startsWith('https://') || isOwnOrigin(href)) continue;
      const host = new URL(href).host;
      if (!EXTERNAL_HOSTS.has(host)) bad.push(`${from}: ${host} is a new host`);
    }
    expect(bad).toEqual([]);
  });

  it('have no dead links: no empty href, no href="#", no whitespace', () => {
    const bad = references(info).filter(({ href }) => href === '' || href === '#' || href !== href.trim());
    expect(bad.map((r) => `${r.from}: "${r.href}"`)).toEqual([]);
  });

  it('do not point at the retired pages, the guides redirect or the renamed repository', () => {
    const bad: string[] = [];
    for (const { from, href } of references(info)) {
      const { path } = splitHref(toSitePath(href));
      if (RETIRED_PAGES.some((p) => path === `/${p}` || path.startsWith(`/${p}/`)) || path === '/guides' || path.startsWith('/guides/')) bad.push(`${from}: ${href}`);
      if (/vivary-dev\/Vivary-New/i.test(href)) bad.push(`${from}: ${href} uses the old repository name`);
    }
    expect(bad).toEqual([]);
  });

  it('open nothing in a new tab without noopener', () => {
    const bad = all(parsePage(info), 'a[target="_blank"]').filter((a) => !/\bnoopener\b/.test(attr(a, 'rel') ?? ''));
    expect(bad.map(show)).toEqual([]);
  });

  it(`stay ${info.variant === 'dark' ? 'under /dark/' : 'out of /dark/'}, except the "${VARIANT_LINK[info.variant]}" link to ${info.twin}`, () => {
    const bad: string[] = [];
    let crossings = 0;
    for (const a of all(parsePage(info), 'a[href]')) {
      const target = toSitePath(attr(a, 'href') ?? '');
      if (isExternal(target) || target.startsWith('#')) continue;
      const { path } = splitHref(target);
      if (!isPagePath(path) || isDarkPath(path) === (info.variant === 'dark')) continue;
      if (visibleText(a) === VARIANT_LINK[info.variant] && path === info.twin) crossings++;
      else bad.push(`${show(a)} crosses to the other variant`);
    }
    expect(bad).toEqual([]);
    expect(crossings, 'the variant link itself').toBeGreaterThan(0);
  });

  it('show every page number in the navs, page index and button bar as a link to a route of its own variant, an anchor or its own site', () => {
    const routes = info.variant === 'dark' ? DARK_ROUTES : LIGHT_ROUTES;
    const doc = parsePage(info);
    const bad: string[] = [];
    let numbers = 0;
    for (const region of all(doc, 'nav')) {
      for (const node of all(region, '*').filter((el) => el.childNodes.some((n) => n.nodeType === 3 && /\b\d{3}\b/.test(n.text)))) {
        for (const [num] of node.childNodes.filter((n) => n.nodeType === 3).flatMap((n) => [...n.text.matchAll(/\b\d{3}\b/g)])) {
          numbers++;
          const link = node.closest('a[href]');
          if (!link) {
            bad.push(`${show(node)}: ${num} is not inside a link`);
            continue;
          }
          const href = attr(link, 'href') ?? '';
          const { path, fragment } = splitHref(toSitePath(href));
          if (href.startsWith('#')) {
            if (!fragmentsIn(info.file).has(fragment ?? '')) bad.push(`${show(link)}: no #${fragment} on the page`);
          } else if (path.startsWith('/')) {
            const ownAnchor = fragment !== undefined && path === info.url;
            if (!routes.has(path) && !ownAnchor) bad.push(`${show(link)}: ${path} is not a route of the ${info.variant} variant`);
          } else {
            const allowed = EXTERNAL_NUMBERS[num] ?? [];
            if (!allowed.some((site) => href.replace(/\/$/, '') === site || href.startsWith(`${site}/`))) bad.push(`${show(link)}: ${num} leads to ${href}, expected ${allowed.join(' or ') || 'a page of this site'}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(numbers, 'page numbers found in the navs').toBeGreaterThan(10);
  });
});
