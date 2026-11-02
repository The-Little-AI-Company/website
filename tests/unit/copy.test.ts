/**
 * The words on the pages: the strings each page keeps, the Vivary release facts, the company voice
 * on the home page, and the house style on every page, light and dark.
 */
import { describe, expect, it } from 'vitest';
import { all, attr, one } from '../helpers/dom';
import { PAGES, PAGE_CASES, PUBLIC, listFiles, page, pageStylesheets, parsePage, type PageInfo } from '../helpers/dist';
import { BANNED_WORDS, FIRST_PERSON, REQUIRED_STRINGS, RETIRED_NAMES, VIVARY_RELEASE } from '../helpers/spec';
import { collapse, textBlocks, visibleText } from '../helpers/text';

const word = (w: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');

/** Everything a visitor or a screen reader meets: the visible text, plus alt, title and aria-label. */
function readable(info: PageInfo): string {
  const doc = parsePage(info);
  const labels = all(doc, '[alt], [title], [aria-label]').flatMap((el) => ['alt', 'title', 'aria-label'].map((name) => attr(el, name) ?? ''));
  return collapse([visibleText(one(doc, 'body')), ...labels].join(' '));
}

const mainText = (info: PageInfo): string => visibleText(one(parsePage(info), 'main'));

const pagesShowing = PAGES.filter((p) => p.shows).map((p) => [p.label, p] as const);

describe.each(pagesShowing)('required strings on %s', (_label, info) => {
  it.each(REQUIRED_STRINGS[info.shows!].map((s) => [s]))('main shows "%s"', (text) => {
    expect(mainText(info)).toContain(text);
  });
});

describe.each(pagesShowing.filter(([, p]) => p.shows === 'vivary' || p.shows === 'home'))('the Vivary release on %s', (_label, info) => {
  const doc = () => parsePage(info);
  const section = () => (info.shows === 'home' ? one(doc(), '#feature-vivary').closest('article, section')! : one(doc(), 'main'));

  it(`shows ${VIVARY_RELEASE.tag} and links its release page`, () => {
    expect(visibleText(section())).toContain(VIVARY_RELEASE.tag);
    const links = all(section(), 'a[href]').filter((a) => attr(a, 'href') === VIVARY_RELEASE.href && visibleText(a) !== '');
    expect(links.length, `no visible link to ${VIVARY_RELEASE.href}`).toBeGreaterThan(0);
  });

  it('carries none of the retired release lines', () => {
    const text = visibleText(one(doc(), 'body'));
    expect(text).not.toMatch(/Windows preview came out/i);
    expect(text).not.toContain('Sept 22, 2026');
    expect(text).not.toMatch(/In development/i);
  });
});

describe('the Vivary page', () => {
  it.each([page('vivary'), page('dark-vivary')].map((p) => [p.label, p] as const))('%s links neither npm nor PyPI', (_label, info) => {
    expect(all(parsePage(info), 'a[href]').map((a) => attr(a, 'href') ?? '').filter((href) => /npmjs\.com|pypi\.org/i.test(href))).toEqual([]);
  });
});

describe('the about page', () => {
  it.each([page('about'), page('dark-about')].map((p) => [p.label, p] as const))('%s does not name Zo', (_label, info) => {
    expect(readable(info)).not.toMatch(word('Zo'));
    expect(readable(info)).not.toMatch(/zocomputer/i);
  });
});

describe('the home page speaks for the company', () => {
  it.each([page('home'), page('dark-home')].map((p) => [p.label, p] as const))('%s has no first person in main', (_label, info) => {
    const text = mainText(info);
    expect(FIRST_PERSON.filter((w) => word(w).test(text))).toEqual([]);
    expect(text, 'names Jeff in the third person').toContain('Jeff Kazzee builds them');
  });
});

describe.each(PAGE_CASES)('house style on %s', (_label, info) => {
  const text = () => readable(info);

  it('has visible text', () => {
    expect(textBlocks(one(parsePage(info), 'body')).length).toBeGreaterThan(5);
  });

  it('has no em dash', () => {
    expect(text().match(/—/g) ?? []).toEqual([]);
  });

  it('uses none of the banned words', () => {
    expect(BANNED_WORDS.filter((w) => word(w).test(text()))).toEqual([]);
  });

  it('never names the retired owl', () => {
    expect(RETIRED_NAMES.filter((w) => word(w).test(text()))).toEqual([]);
  });

  it('has no exclamation point, emoji or placeholder text', () => {
    expect(text().match(/!|\p{Extended_Pictographic}/gu) ?? []).toEqual([]);
    expect(text().match(/lorem ipsum|\bTODO\b|\bTBD\b|\bFIXME\b|coming soon/gi) ?? []).toEqual([]);
  });

  it('types its apostrophes and quotes curly', () => {
    expect(visibleText(one(parsePage(info), 'body')).match(/['"]/g) ?? []).toEqual([]);
  });

  it('loads no Vivary mascot and no Big Shoulders font', () => {
    const doc = parsePage(info);
    const urls = all(doc, '[src], [href], [srcset]').flatMap((el) => [attr(el, 'src'), attr(el, 'href'), attr(el, 'srcset')]).filter(Boolean);
    expect(urls.filter((u) => /mascot/i.test(u!))).toEqual([]);
    for (const sheet of pageStylesheets(info)) {
      expect(sheet.css, sheet.source).not.toMatch(/big[\s_-]*shoulders/i);
      expect(sheet.css, sheet.source).not.toMatch(/mascot/i);
    }
  });
});

describe('public/', () => {
  it('has no file named for the retired owl', () => {
    expect(listFiles(PUBLIC).filter((f) => RETIRED_NAMES.some((w) => word(w).test(f.replace(/[._/-]/g, ' '))))).toEqual([]);
  });
});
