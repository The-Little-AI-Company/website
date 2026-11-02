/**
 * The files around the pages: the web manifest, the app icons, the social card, the README, the sitemap
 * and robots.txt, and the project files.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHex } from '../helpers/color';
import { DIST, PAGES, PUBLIC, ROOT, SITE } from '../helpers/dist';
import { FONT_FAMILIES, LIGHT_TOKENS, RETIRED_PAGES } from '../helpers/spec';

interface Manifest {
  name?: string;
  short_name?: string;
  theme_color?: string;
  background_color?: string;
  display?: string;
  icons?: { src: string; sizes: string; type: string }[];
}

/** RGBA pixels of a PNG. */
async function pixels(file: string): Promise<{ width: number; height: number; data: Buffer }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

describe.each([
  ['public/site.webmanifest', join(PUBLIC, 'site.webmanifest')],
  ['dist/site.webmanifest', join(DIST, 'site.webmanifest')],
])('%s', (_name, path) => {
  const manifest = (): Manifest => JSON.parse(readFileSync(path, 'utf-8')) as Manifest;

  it('uses the light paper for theme_color and background_color', () => {
    expect(manifest().theme_color?.toUpperCase()).toBe(LIGHT_TOKENS['--paper']);
    expect(manifest().background_color?.toUpperCase()).toBe(LIGHT_TOKENS['--paper']);
  });

  it('keeps its name and standalone display', () => {
    expect(manifest().name).toBe('The Little AI Company');
    expect(manifest().short_name).toBe('Little AI Co');
    expect(manifest().display).toBe('standalone');
  });

  it('lists the 192px and 512px icons, and they are that size', async () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => [i.src, i.sizes, i.type])).toEqual([
      ['/icon-192.png', '192x192', 'image/png'],
      ['/icon-512.png', '512x512', 'image/png'],
    ]);
    for (const icon of icons) {
      expect(existsSync(join(DIST, icon.src)), icon.src).toBe(true);
      const { width, height } = await pixels(join(PUBLIC, icon.src));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });
});

describe('the app icons', () => {
  const paper = parseHex(LIGHT_TOKENS['--paper']);
  const pink = parseHex(LIGHT_TOKENS['--pink']);

  it.each([
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ] as const)('%s is an opaque %spx square of paper with the mark in pink', async (file, size) => {
    const { width, height, data } = await pixels(join(PUBLIC, file));
    expect([width, height]).toEqual([size, size]);
    let translucent = 0;
    let onPaper = 0;
    let inPink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) translucent++;
      if (data[i] === paper.r && data[i + 1] === paper.g && data[i + 2] === paper.b) onPaper++;
      if (data[i] === pink.r && data[i + 1] === pink.g && data[i + 2] === pink.b) inPink++;
    }
    // iOS paints transparent pixels black, so an icon has none.
    expect(translucent, 'pixels that are not fully opaque').toBe(0);
    expect(onPaper / (size * size), 'share of the icon that is paper').toBeGreaterThan(0.5);
    expect(inPink / (size * size), 'share of the icon that is the pink mark').toBeGreaterThan(0.05);
    expect([...data.subarray(0, 4)], 'corner').toEqual([paper.r, paper.g, paper.b, 255]);
  });
});

describe('the social card, public/og.png', () => {
  it('is a 1200x630 PNG, and the same file ships in dist/', async () => {
    const { width, height } = await pixels(join(PUBLIC, 'og.png'));
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
    expect(readFileSync(join(DIST, 'og.png')).equals(readFileSync(join(PUBLIC, 'og.png')))).toBe(true);
  });
});

describe('README.md', () => {
  const readme = () => readFileSync(join(ROOT, 'README.md'), 'utf-8');

  it('names the three fonts and both test suites', () => {
    for (const family of FONT_FAMILIES) expect(readme()).toContain(family);
    expect(readme()).toMatch(/Playwright/);
    expect(readme()).toMatch(/pnpm test/);
  });

  it('keeps the dev server address', () => {
    expect(readme()).toContain('http://127.0.0.1:4399');
  });
});

describe('robots.txt and sitemap.xml', () => {
  const robots = () => readFileSync(join(DIST, 'robots.txt'), 'utf-8');
  const sitemap = () => readFileSync(join(DIST, 'sitemap.xml'), 'utf-8');
  const locations = (): string[] => [...sitemap().matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '');

  it('ships a robots.txt that lets every crawler in and names the sitemap by its absolute address', () => {
    expect(robots()).toMatch(/^User-agent: \*$/m);
    expect(robots()).toMatch(/^Allow: \/$/m);
    expect(robots()).not.toMatch(/^Disallow: ./m);
    expect(robots()).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it('lists exactly the five light pages, each by its absolute https address', () => {
    const expected = PAGES.flatMap((p) => (p.variant === 'light' && p.canonical ? [p.canonical] : []));
    expect(expected).toHaveLength(5);
    expect(locations().sort()).toEqual(expected.sort());
  });

  it('leaves out the dark pages, the 404 page and every redirect', () => {
    expect(sitemap()).not.toMatch(/\/dark\//);
    expect(sitemap()).not.toMatch(/404/);
    for (const redirect of [...RETIRED_PAGES, 'guides']) expect(sitemap(), redirect).not.toContain(`/${redirect}/`);
  });

  it('is well-formed sitemap XML', () => {
    expect(sitemap().startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(sitemap()).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap().trimEnd().endsWith('</urlset>')).toBe(true);
  });
});

describe('project files', () => {
  it('keeps the CNAME for the custom domain', () => {
    expect(readFileSync(join(PUBLIC, 'CNAME'), 'utf-8').trim()).toBe('littleaicompany.com');
  });

  it('ignores the test output directories', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8').split('\n').map((l) => l.trim());
    for (const dir of ['test-results/', 'playwright-report/', 'blob-report/']) expect(ignore).toContain(dir);
  });

  it('has the scripts the team runs', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test']).toBe('vitest run');
    expect(pkg.scripts['test:e2e']).toBe('playwright test --project=chromium');
    expect(pkg.scripts['verify']).toBe('pnpm check:node && pnpm test:node && pnpm check && pnpm build && pnpm test && pnpm test:e2e');
    expect(pkg.scripts['check']).toBe('astro check --minimumFailingSeverity hint');
    expect(pkg.scripts['icons']).toBe('node scripts/icons.mjs');
    expect(pkg.scripts['screenshots']).toBe('playwright test --project=screenshots');
    for (const name of ['dev', 'build', 'preview']) expect(pkg.scripts[name], name).toBeDefined();
  });

  describe('the end-to-end run', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    interface E2eConfig {
      forbidOnly?: boolean;
      reporter?: unknown;
      use?: { trace?: string };
      projects?: { name: string; testMatch?: string; testIgnore?: string }[];
    }
    const configWith = async (ci: string): Promise<E2eConfig> => {
      vi.resetModules();
      vi.stubEnv('CI', ci);
      // Hosted Actions also counts as CI, so a laptop run must clear it as well.
      if (!ci) vi.stubEnv('GITHUB_ACTIONS', '');
      return ((await import('../../playwright.config')) as { default: E2eConfig }).default;
    };
    const scripts = (): Record<string, string> => (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;

    it('keeps the screenshots out of the checks and in a project of their own, since they check nothing and take a while', async () => {
      const projects = (await configWith('')).projects ?? [];
      expect(projects.map((p) => p.name)).toEqual(['chromium', 'screenshots']);
      expect(projects[0]?.testIgnore).toBe('**/screenshots.spec.ts');
      expect(projects[1]?.testMatch).toBe('**/screenshots.spec.ts');
      expect(existsSync(join(ROOT, 'tests/e2e/screenshots.spec.ts'))).toBe(true);
    });

    it('selects the project by name, so no script depends on a POSIX environment variable', () => {
      expect(scripts()['test:e2e']).toContain('--project=chromium');
      expect(scripts()['screenshots']).toContain('--project=screenshots');
      for (const name of ['test:e2e', 'screenshots']) expect(scripts()[name], name).not.toMatch(/^\w+=/);
    });

    it('keeps an HTML report and a trace of each failure on CI, and a plain list on a laptop', async () => {
      const ci = await configWith('true');
      expect(ci.reporter).toEqual([['list'], ['html', { open: 'never' }]]);
      expect(ci.use?.trace).toBe('retain-on-failure');
      expect(ci.forbidOnly).toBe(true);
      const laptop = await configWith('');
      expect(laptop.reporter).toBe('list');
      expect(laptop.use?.trace).toBe('off');
      expect(laptop.forbidOnly).toBe(false);
    });
  });
});
