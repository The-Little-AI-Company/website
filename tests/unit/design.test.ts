/**
 * Direction K in the built CSS: the light and dark tokens, the contrast of the pairs the pages set
 * text in, the three self-hosted fonts, and nothing that follows the visitor's OS color setting.
 * The browser suite checks the same system on the rendered pages.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast } from '../helpers/color';
import { allBlocks, declarations, fontFamilies, parseCss, rootVariables } from '../helpers/css';
import { DIST, PUBLIC, ROOT, listFiles, siteStylesheets } from '../helpers/dist';
import { DARK_TOKENS, FONT_FAMILIES, LIGHT_TOKENS } from '../helpers/spec';

const css = (file: string): string => readFileSync(join(DIST, 'styles', file), 'utf-8');
const lightVars = (): Map<string, string> => rootVariables(parseCss(css('site.css')));
/** The dark pages load site.css and then dark.css, so dark.css's tokens win. */
const darkVars = (): Map<string, string> => new Map([...lightVars(), ...rootVariables(parseCss(css('dark.css')))]);
const upper = (vars: Map<string, string>): Record<string, string | undefined> => Object.fromEntries([...vars].map(([k, v]) => [k, v.toUpperCase()]));

describe('tokens', () => {
  it('site.css defines the light tokens with the approved values', () => {
    expect(upper(lightVars())).toMatchObject(LIGHT_TOKENS);
  });

  it('dark.css turns them into the dark tokens with the approved values', () => {
    expect(upper(darkVars())).toMatchObject(DARK_TOKENS);
  });
});

/**
 * Every pair of tokens the stylesheets set text in: [text, ground]. Pink text on paper is
 * --pink-text, which dark.css sets to --pink, since bright pink passes on the night ground.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--ink', '--paper'],
  ['--ink-soft', '--paper'],
  ['--ink-muted', '--paper'],
  ['--pink-text', '--paper'],
  ['--ink', '--paper-white'],
  ['--on-fill', '--pink'],
  ['--on-fill', '--yellow'],
  ['--on-band', '--band'],
  ['--yellow', '--band'],
  ['--pink', '--band'],
  ['--ink-faint-on-dark', '--band'],
];

describe.each([
  ['light', lightVars],
  ['dark', darkVars],
] as const)('contrast on %s pages', (_variant, vars) => {
  it.each(TEXT_PAIRS.map(([fg, bg]) => [`${fg} on ${bg}`, fg, bg] as const))('%s meets WCAG AA for body text, 4.5:1', (_name, fg, bg) => {
    const [text, ground] = [vars().get(fg), vars().get(bg)];
    expect(text, `${fg} is defined`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ground, `${bg} is defined`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(text!, ground!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the OS color setting', () => {
  it('is read nowhere: no prefers-color-scheme in any built HTML, CSS or SVG, or in public/', () => {
    const files = [...listFiles(DIST).map((f) => join(DIST, f)), ...listFiles(PUBLIC).map((f) => join(PUBLIC, f))].filter((f) => /\.(html|css|svg)$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((f) => /prefers-color-scheme/i.test(readFileSync(f, 'utf-8')))).toEqual([]);
  });
});

describe('fonts', () => {
  const faces = () =>
    siteStylesheets().flatMap((sheet) =>
      allBlocks(parseCss(sheet.css))
        .filter((b) => b.kind === 'at' && b.name === 'font-face')
        .map((b) => Object.fromEntries(b.declarations.map((d) => [d.prop, d.value]))),
    );

  it('declares only Dela Gothic One, Zen Kaku Gothic New and VT323', () => {
    expect(new Set(faces().map((f) => fontFamilies(f['font-family'] ?? '')[0]))).toEqual(new Set(FONT_FAMILIES));
  });

  it('loads every face from a woff2 file under /fonts/ that ships in dist/', () => {
    for (const face of faces()) {
      const urls = [...(face['src'] ?? '').matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1] ?? '');
      expect(urls.length, face['font-family']).toBeGreaterThan(0);
      expect(face['src'], 'no local() fallback that could pick up an installed copy').not.toMatch(/local\(/);
      for (const url of urls) {
        expect(url).toMatch(/^\/fonts\/[\w-]+\.woff2$/);
        expect(readFileSync(join(DIST, url)).subarray(0, 4).toString('latin1'), `${url} is a woff2 file`).toBe('wOF2');
      }
    }
  });

  it('ships the SIL Open Font License beside the fonts, once for each family', () => {
    const expected = FONT_FAMILIES.map((family) => `OFL-${family.toLowerCase().replace(/\s+/g, '-')}.txt`);
    expect(listFiles(join(PUBLIC, 'fonts')).filter((f) => f.endsWith('.txt')).sort()).toEqual(expected.sort());
    for (const file of expected) {
      const text = readFileSync(join(DIST, 'fonts', file), 'utf-8');
      expect(text, file).toContain('licensed under the SIL Open Font License, Version 1.1');
      expect(text, `${file} carries the whole license`).toMatch(/PREAMBLE[\s\S]*DISCLAIMER/);
    }
  });

  it('ships no font file that no face uses', () => {
    const used = new Set(faces().flatMap((f) => [...(f['src'] ?? '').matchAll(/url\(\s*["']?\/fonts\/([^"')]+)/g)].map((m) => m[1])));
    expect(listFiles(join(PUBLIC, 'fonts')).filter((f) => !f.endsWith('.txt') && !used.has(f))).toEqual([]);
  });
});

describe('motion', () => {
  it('moves nothing on its own: no animation, no keyframes and no transition', () => {
    const found = siteStylesheets().flatMap((sheet) => {
      const blocks = allBlocks(parseCss(sheet.css));
      const keyframes = blocks.filter((b) => b.kind === 'at' && /keyframes$/.test(b.name)).map((b) => `${sheet.source}: @${b.name}`);
      const props = declarations(parseCss(sheet.css))
        .filter(({ declaration }) => /^(?:animation|transition)(?:-|$)/.test(declaration.prop))
        .map(({ declaration }) => `${sheet.source}: ${declaration.prop}`);
      return [...keyframes, ...props];
    });
    expect(found).toEqual([]);
  });
});

describe('the holiday overlay', () => {
  it('is off: no stylesheet keys off data-season and no workflow runs on a schedule', () => {
    for (const sheet of siteStylesheets()) expect(sheet.css, sheet.source).not.toMatch(/data-season/);
    const workflows = listFiles(join(ROOT, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f));
    expect(workflows.length).toBeGreaterThan(0);
    expect(workflows.filter((f) => /^\s*schedule\s*:/m.test(readFileSync(join(ROOT, '.github', 'workflows', f), 'utf-8')))).toEqual([]);
  });
});
