/**
 * The files around the pages: the web manifest, the app icons, the social card, the README, the sitemap
 * and robots.txt, and the project files.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contrast, parseHex } from '../helpers/color';
import { DIST, PAGES, PUBLIC, ROOT, SITE, SITE_NAME, listFiles } from '../helpers/dist';
import { decodePng, pixelAt, readPngSize } from '../helpers/image';
import { HEAD, RETIRED_PAGES } from '../helpers/spec';
import { themeColor } from '../helpers/tokens';

interface Manifest {
  name?: string;
  short_name?: string;
  theme_color?: string;
  background_color?: string;
  display?: string;
  icons?: { src: string; sizes: string; type: string }[];
}

describe.each([
  ['public/site.webmanifest', join(PUBLIC, 'site.webmanifest')],
  ['dist/site.webmanifest', join(DIST, 'site.webmanifest')],
])('%s', (_name, path) => {
  const manifest = (): Manifest => JSON.parse(readFileSync(path, 'utf-8')) as Manifest;

  it('uses the ivory ground for theme_color and background_color', () => {
    expect(manifest().theme_color).toBe(HEAD.themeColorLight.content);
    expect(manifest().background_color).toBe(HEAD.themeColorLight.content);
  });

  it('keeps its name and standalone display', () => {
    expect(manifest().name).toBe(SITE_NAME);
    expect(manifest().short_name).toBe('Little AI Co');
    expect(manifest().display).toBe('standalone');
  });

  it('keeps the 192px and 512px icons, and they exist', () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => [i.src, i.sizes, i.type])).toEqual([
      ['/icon-192.png', '192x192', 'image/png'],
      ['/icon-512.png', '512x512', 'image/png'],
    ]);
    for (const icon of icons) {
      expect(existsSync(join(DIST, icon.src)), icon.src).toBe(true);
      const { width, height } = readPngSize(readFileSync(join(PUBLIC, icon.src)));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });
});

describe('the app icons', () => {
  const ground = parseHex(HEAD.themeColorLight.content);
  const ink = parseHex(themeColor('company-light', 'ink'));

  it.each([
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ] as const)('%s is an opaque %spx square of the ground color with the mark in ink', (file, size) => {
    const png = decodePng(readFileSync(join(PUBLIC, file)));
    expect([png.width, png.height]).toEqual([size, size]);
    let translucent = 0;
    let onGround = 0;
    let inInk = 0;
    for (let i = 0; i < png.pixels.length; i += 4) {
      if (png.pixels[i + 3] !== 255) translucent++;
      if (png.pixels[i] === ground.r && png.pixels[i + 1] === ground.g && png.pixels[i + 2] === ground.b) onGround++;
      if (png.pixels[i] === ink.r && png.pixels[i + 1] === ink.g && png.pixels[i + 2] === ink.b) inInk++;
    }
    // iOS paints transparent pixels black, so an icon has none.
    expect(translucent, 'pixels that are not fully opaque').toBe(0);
    expect(onGround / (size * size), 'share of the icon that is the ground color').toBeGreaterThan(0.5);
    expect(inInk / (size * size), 'share of the icon that is the ink of the mark').toBeGreaterThan(0.05);
    expect(pixelAt(png, 0, 0), 'corner').toEqual([ground.r, ground.g, ground.b, 255]);
  });
});

describe('the social card, public/og.png', () => {
  const file = join(PUBLIC, 'og.png');

  it('is a 1200x630 PNG, and the same file ships in dist/', () => {
    expect(readPngSize(readFileSync(file))).toEqual({ width: 1200, height: 630 });
    expect(readFileSync(join(DIST, 'og.png')).equals(readFileSync(file))).toBe(true);
  });

  describe('pixels', () => {
    const png = () => decodePng(readFileSync(file));

    it('sits on the ivory ground: most of the card is --ground', () => {
      const image = png();
      const ground = parseHex(HEAD.themeColorLight.content);
      let onGround = 0;
      for (let i = 0; i < image.width * image.height; i++) {
        const o = i * 4;
        const near = [0, 1, 2].every((c, k) => Math.abs((image.pixels[o + c] ?? 0) - [ground.r, ground.g, ground.b][k]!) <= 3);
        if (near) onGround++;
      }
      const share = onGround / (image.width * image.height);
      expect(share, `${(share * 100).toFixed(1)}% of the card is ${HEAD.themeColorLight.content}`).toBeGreaterThan(0.5);
    });

    it('carries ink: the title, the mark and a rule, a few percent of the card', () => {
      const image = png();
      let dark = 0;
      for (let i = 0; i < image.width * image.height; i++) {
        const o = i * 4;
        const colour = `#${[0, 1, 2].map((c) => (image.pixels[o + c] ?? 0).toString(16).padStart(2, '0')).join('')}`;
        if (contrast(colour, HEAD.themeColorLight.content) >= 7) dark++;
      }
      const share = dark / (image.width * image.height);
      expect(share, `${(share * 100).toFixed(2)}% of the card is ink`).toBeGreaterThan(0.01);
      expect(share).toBeLessThan(0.4);
    });
  });
});

describe('scripts/', () => {
  const files = () => listFiles(join(ROOT, 'scripts'));

  it('holds the script that renders the social card with Playwright', () => {
    expect(files().length, 'scripts/ is missing or empty').toBeGreaterThan(0);
    const generators = files().filter((f) => {
      const text = readFileSync(join(ROOT, 'scripts', f), 'utf-8');
      return /og\.png/.test(text) && /playwright/i.test(text);
    });
    expect(generators.length, 'no script under scripts/ mentions og.png and playwright').toBeGreaterThan(0);
  });
});

describe('README.md', () => {
  const readme = () => readFileSync(join(ROOT, 'README.md'), 'utf-8');

  it('describes the fonts, the tokens, and both test suites', () => {
    const text = readme();
    expect(text).toMatch(/Instrument Serif/);
    expect(text).toMatch(/Instrument Sans/);
    expect(text).toMatch(/tokens\.css/);
    expect(text).toMatch(/design\/tokens\.json/);
    expect(text).toMatch(/Playwright|test:e2e/);
    expect(text).toMatch(/pnpm test/);
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

  it('lists exactly the five public pages, each by its absolute https address', () => {
    const expected = PAGES.filter((p) => p.id !== 'not-found').map((p) => `${SITE}${p.url}`);
    expect(locations().sort()).toEqual(expected.sort());
    for (const loc of locations()) expect(loc).toMatch(/^https:\/\/[^\s/]+\/\S*$/);
  });

  it('leaves out the 404 page and every redirect', () => {
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
    expect(pkg.scripts['og']).toBe('node scripts/og.mjs');
    expect(pkg.scripts['icons']).toBe('node scripts/icons.mjs');
    expect(pkg.scripts['images']).toBe('node scripts/images.mjs');
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
