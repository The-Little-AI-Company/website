/**
 * Voice and copy rules, checked over the visible text of every built page, the alt text of its
 * images, and the text search engines and social cards show: first person singular, no hype words,
 * typeset quotes, sentence case, no invented prices, dates or placeholders.
 */
import { describe, expect, it } from 'vitest';
import {
  allCapsWords,
  bannedWords,
  currency,
  dates,
  emDashes,
  emoji,
  exclamations,
  firstPersonPlural,
  retiredNames,
  semicolons,
  titleCaseWords,
} from '../helpers/copy';
import { all, attr, type El } from '../helpers/dom';
import { PAGE_CASES, parsePage, readDist, type PageInfo } from '../helpers/dist';
import { KNOWN_DATES } from '../helpers/spec';
import { altTexts, collapse, textBlocks, textOf, visibleText } from '../helpers/text';

interface Snippet {
  /** Where the text came from, for the failure message. */
  where: string;
  text: string;
}

/** Everything a visitor, a screen reader, a search result or a shared link can show. */
function snippets(info: PageInfo): Snippet[] {
  const doc = parsePage(info);
  const out: Snippet[] = [];
  for (const block of textBlocks(all(doc, 'body')[0]!)) out.push({ where: 'text', text: block });
  for (const alt of altTexts(doc)) out.push({ where: 'alt', text: alt });
  out.push({ where: 'title', text: textOf(all(doc, 'head title')[0]!) });
  for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:image:alt"]']) {
    for (const meta of all(doc, selector)) out.push({ where: selector, text: collapse(attr(meta, 'content') ?? '') });
  }
  return out;
}

type Rule = (text: string) => string[];
const times = (count: number, what: string): string[] => Array.from({ length: count }, () => what);

const RULES: readonly (readonly [name: string, rule: Rule])[] = [
  // Words in quotation marks are not the site's voice: they are what a screenshot says (“What are we working on?”).
  ['says "I", never we, our, ours or us', (t) => firstPersonPlural(t.replace(/“[^”]*”/g, ''))],
  ['has no all-caps words beyond AI, MIT, API, APIs, LLM, HTML, CSS, CLI, V1, OS, ZIP', allCapsWords],
  ['has no straight apostrophe or quote (they are typeset: ’ “ ”)', (t) => t.match(/['"]/g) ?? []],
  ['has no em dash', (t) => times(emDashes(t), '—')],
  ['has no semicolon', (t) => times(semicolons(t), ';')],
  ['has no exclamation point', (t) => times(exclamations(t), '!')],
  ['has no emoji', emoji],
  ['uses none of the banned words', bannedWords],
  ['names no retired project', retiredNames],
  ['quotes no price in dollars', currency],
  ['has no space before punctuation', (t) => t.match(/\s[,.;:!?](?=\s|$)/g) ?? []],
  ['repeats no word by accident', (t) => [...t.matchAll(/\b(\w{3,})\s+\1\b/gi)].map((m) => m[0])],
  ['has no placeholder text', (t) => t.match(/lorem ipsum|\bTODO\b|\bTBD\b|\bFIXME\b|\bplaceholder\b|coming soon/gi) ?? []],
];

describe.each(PAGE_CASES)('copy rules on %s', (_label, info) => {
  it.each(RULES)('%s', (_name, rule) => {
    const offenders = snippets(info).flatMap((s) => rule(s.text).map((hit) => `${s.where}: "${hit}" in "${s.text.slice(0, 80)}"`));
    expect(offenders).toEqual([]);
  });

  it('dates only the days the site has a reason to name (Oct 3, Oct 8 and Nov 1, 2026)', () => {
    const found = snippets(info).flatMap((s) => dates(s.text));
    const unknown = found.filter((d) => !(KNOWN_DATES as readonly string[]).includes(d));
    expect(unknown, 'a date that is not in KNOWN_DATES would be invented').toEqual([]);
  });

  it('keeps headings, buttons, labels, captions and lane names in sentence case', () => {
    const doc = parsePage(info);
    const bad: string[] = [];
    const check = (els: El[], kind: string): void => {
      for (const el of els) {
        const words = titleCaseWords(textOf(el));
        if (words.length > 0) bad.push(`${kind} "${textOf(el)}": ${words.join(', ')}`);
      }
    };
    check(all(doc, 'h1, h2'), 'heading');
    check(all(doc, '.btn'), 'button');
    check(all(doc, '.status, .now, .numeral'), 'label');
    check(all(doc, 'figcaption'), 'caption');
    check(all(doc, 'dl.lanes dt'), 'lane name');
    expect(bad).toEqual([]);
  });

  it('keeps a space between prose and inline links (Astro drops it when a line breaks before an inline element)', () => {
    const html = readDist(info.file);
    expect(html).not.toMatch(/[A-Za-z,:]<a\b/);
    expect(html).not.toMatch(/<\/a>[A-Za-z]/);
  });

  it('names no retired project anywhere in the HTML, attributes included', () => {
    const html = readDist(info.file).replace(/data-astro-cid-[a-z0-9]+/g, '');
    expect(retiredNames(html)).toEqual([]);
  });

  it('has visible text', () => {
    expect(visibleText(all(parsePage(info), 'main')[0]!).length).toBeGreaterThan(40);
  });
});
