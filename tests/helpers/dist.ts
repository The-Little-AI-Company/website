import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type HTMLElement } from 'node-html-parser';
import { NOT_FOUND, PAGE_TABLE, type LightId, type Variant } from './spec';

/** Repository root, found from this file so the tests do not depend on the working directory. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DIST = join(ROOT, 'dist');
export const SRC = join(ROOT, 'src');
export const PUBLIC = join(ROOT, 'public');

export const SITE = 'https://littleaicompany.com';

export type PageId = LightId | `dark-${LightId}` | 'not-found';

export interface PageInfo {
  id: PageId;
  /** Short label for test names. */
  label: string;
  /** URL path on the site. The 404 page is served from `/404.html`. */
  url: string;
  /** File under dist/. */
  file: string;
  variant: Variant;
  /** The `<title>` the page must have. A dark page has its light page's title. */
  title: string;
  h1: string;
  /** Where the variant link goes: the same page in the other variant, or `/dark/` from the 404 page. */
  twin: string;
  /** The canonical URL, always of the light page. The 404 page has none: no one should be sent to it. */
  canonical?: string;
  /** The light page whose content this page shows. The 404 page shows none. */
  shows?: LightId;
}

const lightPages: PageInfo[] = PAGE_TABLE.map((p) => ({
  id: p.id,
  label: p.id,
  url: p.path,
  file: `${p.path.slice(1)}index.html`,
  variant: 'light',
  title: p.title,
  h1: p.h1,
  twin: `/dark${p.path}`,
  canonical: `${SITE}${p.path}`,
  shows: p.id,
}));

const darkPages: PageInfo[] = PAGE_TABLE.map((p, i) => ({
  ...lightPages[i]!,
  id: `dark-${p.id}`,
  label: `dark ${p.id}`,
  url: `/dark${p.path}`,
  file: `dark/${p.path.slice(1)}index.html`,
  variant: 'dark',
  twin: p.path,
}));

const notFound: PageInfo = {
  id: 'not-found',
  label: '404',
  url: '/404.html',
  file: '404.html',
  variant: 'light',
  title: NOT_FOUND.title,
  h1: NOT_FOUND.h1,
  twin: '/dark/',
};

/** Every built page: the five light pages, their five dark twins, and the 404 page. */
export const PAGES: readonly PageInfo[] = [...lightPages, ...darkPages, notFound];

/** `[label, page]` tuples for `describe.each`, so test names read `home` rather than `'home'`. */
export const PAGE_CASES: readonly (readonly [string, PageInfo])[] = PAGES.map((p) => [p.label, p] as const);

export const page = (id: PageId): PageInfo => {
  const found = PAGES.find((p) => p.id === id);
  if (!found) throw new Error(`unknown page ${id}`);
  return found;
};

export function distPath(file: string): string {
  return join(DIST, file);
}

/** Reads a file from dist/, with an error that says what to do when it is missing. */
export function readDist(file: string): string {
  const path = distPath(file);
  if (!existsSync(path)) throw new Error(`dist/${file} does not exist. Run \`pnpm build\`, and the page must be part of the site.`);
  return readFileSync(path, 'utf-8');
}

const parsed = new Map<string, HTMLElement>();

/** The built HTML of a page, parsed. Parsed once per run. */
export function parsePage(info: PageInfo): HTMLElement {
  const cached = parsed.get(info.file);
  if (cached) return cached;
  const root = parse(readDist(info.file), { comment: false });
  parsed.set(info.file, root);
  return root;
}

function parseHtml(html: string): HTMLElement {
  return parse(html, { comment: false });
}

/** Every file under `dir`, as paths relative to it, sorted. */
export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

const sha256 = (data: string): string => createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------------------
// Stylesheets

export interface Stylesheet {
  /** Where it came from: a file under dist/ or `inline`. */
  source: string;
  css: string;
}

/** Inline `<style>` blocks and linked stylesheets of one page, in document order. */
export function pageStylesheets(info: PageInfo): Stylesheet[] {
  const root = parsePage(info);
  const sheets: Stylesheet[] = [];
  for (const el of root.querySelectorAll('style, link[rel="stylesheet"]')) {
    if (el.rawTagName.toLowerCase() === 'style') {
      sheets.push({ source: `${info.file} <style>`, css: el.text });
      continue;
    }
    const href = el.getAttribute('href') ?? '';
    const file = href.replace(/^\//, '').split(/[?#]/)[0] ?? '';
    const path = distPath(file);
    if (existsSync(path) && !href.startsWith('http')) sheets.push({ source: file, css: readFileSync(path, 'utf-8') });
  }
  return sheets;
}

/**
 * Every distinct stylesheet the site ships: all of dist/**\/*.css plus the inline
 * `<style>` blocks of every page, de-duplicated by content so a block that is
 * inlined into several pages is read once.
 */
export function siteStylesheets(): Stylesheet[] {
  const seen = new Set<string>();
  const sheets: Stylesheet[] = [];
  const add = (sheet: Stylesheet): void => {
    const key = sha256(sheet.css);
    if (seen.has(key)) return;
    seen.add(key);
    sheets.push(sheet);
  };
  for (const file of listFiles(DIST).filter((f) => f.endsWith('.css'))) {
    add({ source: file, css: readFileSync(distPath(file), 'utf-8') });
  }
  for (const info of PAGES) for (const sheet of pageStylesheets(info)) add(sheet);
  return sheets;
}

// ---------------------------------------------------------------------------
// Links

/** Splits `/a/b/?x=1#frag` into its path and fragment. */
export function splitHref(href: string): { path: string; fragment: string | undefined } {
  const hash = href.indexOf('#');
  const noHash = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? undefined : href.slice(hash + 1);
  return { path: noHash.split('?')[0] ?? '', fragment };
}

/**
 * Maps a site path to the file that serves it under dist/, or undefined.
 * `/callout/` -> callout/index.html, `/callout` -> callout/index.html, `/og.png` -> og.png.
 */
export function resolveSitePath(path: string): string | undefined {
  const clean = decodeURIComponent(path).replace(/^\/+/, '');
  const candidates = clean === '' || clean.endsWith('/') ? [`${clean}index.html`] : [clean, `${clean}/index.html`, `${clean}.html`];
  for (const candidate of candidates) {
    const full = distPath(candidate);
    if (existsSync(full) && statSync(full).isFile()) return candidate;
  }
  return undefined;
}

/** The `id` of every element and `name` of every anchor in a built file. */
export function fragmentsIn(file: string): Set<string> {
  const root = parseHtml(readDist(file));
  const ids = new Set<string>();
  for (const el of root.querySelectorAll('[id]')) ids.add(el.getAttribute('id') ?? '');
  for (const el of root.querySelectorAll('a[name]')) ids.add(el.getAttribute('name') ?? '');
  return ids;
}

/** Candidate URLs of an `srcset` value. */
export function srcsetUrls(srcset: string): string[] {
  return srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}
