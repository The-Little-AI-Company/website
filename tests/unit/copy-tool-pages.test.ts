/**
 * The /callout/ and /vivary/ pages: the tool hero (badge, name, tagline, summary, buttons, plate),
 * then every section, compared with the expected copy word for word.
 */
import { describe, expect, it } from 'vitest';
import { callout, vivary } from '../../src/data/tools';
import { all, attr, classesOf, inOrder, one, type El } from '../helpers/dom';
import { page, parsePage, srcsetUrls } from '../helpers/dist';
import { badges, buttons, headings, lanes, links, paragraph, proseParagraphs, rowMismatches, sectionOf } from '../helpers/sections';
import { CALLOUT_PAGE, RELEASED_PATTERN, VIVARY_PAGE, type SectionExpectation } from '../helpers/spec';
import { textOf } from '../helpers/text';

const calloutDoc = () => parsePage(page('callout'));
const vivaryDoc = () => parsePage(page('vivary'));
const heroOf = (doc: El): El => {
  const section = one(doc, 'main h1').closest('section');
  if (!section) throw new Error('the h1 is not inside a <section>');
  return section;
};

function expectSection(doc: El, expected: SectionExpectation): void {
  const section = sectionOf(one(doc, 'main'), expected.heading);
  expect(one(section, 'h2').rawTagName.toLowerCase()).toBe('h2');
  expect(proseParagraphs(section)).toEqual([...expected.paragraphs]);
  expect(lanes(section).map(({ term, detail }) => ({ term, detail }))).toEqual(expected.lanes.map(({ term, detail }) => ({ term, detail })));
}

describe('callout: hero', () => {
  const hero = () => heroOf(calloutDoc());

  it('opens with the shipped badge reading "Released · vX.Y.Z"', () => {
    const found = badges(hero());
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('shipped');
    expect(found[0]?.label).toMatch(RELEASED_PATTERN);
    expect(attr(one(hero(), '.status i'), 'aria-hidden')).toBe('true');
  });

  it('has the display-l h1 "Callout"', () => {
    const h1 = one(hero(), 'h1');
    expect(classesOf(h1)).toContain('display-l');
    expect(textOf(h1)).toBe(CALLOUT_PAGE.h1);
  });

  it('has the tagline as its lede and the tools.ts summary under it', () => {
    expect(textOf(one(hero(), 'p.lede'))).toBe(CALLOUT_PAGE.lede);
    expect(CALLOUT_PAGE.lede).toBe(callout.tagline);
    expect(textOf(paragraph(hero(), callout.summary))).toBe(callout.summary);
  });

  it('has Download for Windows (primary, the installer) and Source on GitHub (secondary)', () => {
    expect(buttons(hero()).map((b) => ({ label: b.label, href: b.href, variant: b.variant }))).toEqual(
      CALLOUT_PAGE.buttons.map((b) => ({ label: b.label, href: b.href, variant: b.variant })),
    );
    expect(callout.primary.href).toBe(CALLOUT_PAGE.buttons[0].href);
    expect(callout.repo).toBe(CALLOUT_PAGE.buttons[1].href);
  });

  it('shows the facts plate beside the text: the rows, then the quote the result header carries', () => {
    const plate = one(hero(), '.plate');
    expect(rowMismatches(lanes(plate, 'dl'), CALLOUT_PAGE.plate.rows)).toEqual([]);
    expect(textOf(one(plate, 'figure.quote blockquote p'))).toBe(CALLOUT_PAGE.plate.quoteShown);
    expect(textOf(one(plate, 'figure.quote figcaption'))).toBe(CALLOUT_PAGE.plate.quoteCaption);
    expect(one(plate, 'dl').closest('figure'), 'the facts are not a figure').toBeNull();
  });

  it('runs badge, h1, tagline, summary, buttons, plate', () => {
    const els = [
      one(hero(), '.status'),
      one(hero(), 'h1'),
      one(hero(), 'p.lede'),
      paragraph(hero(), callout.summary),
      one(hero(), '.actions'),
      one(hero(), '.plate'),
    ];
    expect(inOrder(calloutDoc(), els)).toBe(true);
  });
});

describe('callout: sections', () => {
  it('has the h2s What it does, How it works, What stays on your machine, Get it', () => {
    expect(headings(one(calloutDoc(), 'main')).filter(([level]) => level === 2).map(([, text]) => text)).toEqual([
      ...CALLOUT_PAGE.sections.map((s) => s.heading),
      CALLOUT_PAGE.get.heading,
    ]);
  });

  it.each(CALLOUT_PAGE.sections.map((s) => [s.heading, s] as const))('carries over the copy of "%s"', (_heading, expected) => {
    expectSection(calloutDoc(), expected);
  });

  describe('Get it', () => {
    const section = () => sectionOf(one(calloutDoc(), 'main'), CALLOUT_PAGE.get.heading);

    it('can be linked to: the home page sends "Get Callout" to #get-it', () => {
      expect(attr(section(), 'id')).toBe(CALLOUT_PAGE.get.id);
    });

    it('has the lede, the download button, and the SmartScreen note', () => {
      expect(textOf(one(section(), 'p.lede'))).toBe(CALLOUT_PAGE.get.lede);
      expect(buttons(section()).map((b) => [b.label, b.href, b.variant])).toEqual([[CALLOUT_PAGE.get.button.label, CALLOUT_PAGE.get.button.href, 'primary']]);
      expect(textOf(paragraph(section(), CALLOUT_PAGE.get.note))).toBe(CALLOUT_PAGE.get.note);
    });

    it('runs lede, button, note', () => {
      expect(inOrder(calloutDoc(), [one(section(), 'p.lede'), one(section(), '.btn'), paragraph(section(), CALLOUT_PAGE.get.note)])).toBe(true);
    });
  });
});

describe('vivary: hero', () => {
  const hero = () => heroOf(vivaryDoc());

  it('opens with the wip badge and the unsigned preview date', () => {
    expect(badges(hero()).map((b) => [b.tone, b.label])).toEqual([['wip', VIVARY_PAGE.status]]);
    expect(attr(one(hero(), '.status i'), 'aria-hidden')).toBe('true');
  });

  it('has the display-l h1 "Vivary"', () => {
    const h1 = one(hero(), 'h1');
    expect(classesOf(h1)).toContain('display-l');
    expect(textOf(h1)).toBe(VIVARY_PAGE.h1);
  });

  it('has the tagline as its lede and the tools.ts summary under it', () => {
    expect(textOf(one(hero(), 'p.lede'))).toBe(VIVARY_PAGE.lede);
    expect(VIVARY_PAGE.lede).toBe(vivary.tagline);
    expect(textOf(paragraph(hero(), vivary.summary))).toBe(vivary.summary);
  });

  it('has Download 0.1.0-beta.1 (primary, the release page) and Release queue on GitHub (secondary)', () => {
    expect(buttons(hero()).map((b) => ({ label: b.label, href: b.href, variant: b.variant }))).toEqual(
      VIVARY_PAGE.buttons.map((b) => ({ label: b.label, href: b.href, variant: b.variant })),
    );
  });

  it('shows the vivaryagent.xyz screenshot in an eager Plate with its caption', () => {
    const plate = one(hero(), 'figure.plate');
    const img = one(plate, 'img');
    const p = VIVARY_PAGE.plate;
    expect(attr(img, 'src')).toBe(p.src);
    expect(srcsetUrls(attr(img, 'srcset') ?? '')).toEqual([p.small.src, p.src]);
    expect(attr(img, 'sizes')).toBeDefined();
    expect(attr(img, 'width')).toBe(String(p.width));
    expect(attr(img, 'height')).toBe(String(p.height));
    expect(attr(img, 'alt')).toBe(p.alt);
    expect(attr(img, 'fetchpriority')).toBe('high');
    expect(attr(img, 'loading')).not.toBe('lazy');
    expect(attr(img, 'decoding')).toBe('async');
    expect(textOf(one(plate, 'figcaption'))).toBe(p.caption);
  });

  it('runs badge, h1, tagline, summary, buttons, plate', () => {
    const els = [one(hero(), '.status'), one(hero(), 'h1'), one(hero(), 'p.lede'), paragraph(hero(), vivary.summary), one(hero(), '.actions'), one(hero(), 'figure.plate')];
    expect(inOrder(vivaryDoc(), els)).toBe(true);
  });
});

describe('vivary: sections', () => {
  it('has the h2s What it is, What it asks of you, Status', () => {
    expect(headings(one(vivaryDoc(), 'main')).filter(([level]) => level === 2).map(([, text]) => text)).toEqual([
      ...VIVARY_PAGE.sections.map((s) => s.heading),
      VIVARY_PAGE.statusSection.heading,
    ]);
  });

  it.each(VIVARY_PAGE.sections.map((s) => [s.heading, s] as const))('carries over the copy of "%s"', (_heading, expected) => {
    expectSection(vivaryDoc(), expected);
  });

  describe('Status', () => {
    const section = () => sectionOf(one(vivaryDoc(), 'main'), VIVARY_PAGE.statusSection.heading);
    const s = VIVARY_PAGE.statusSection;

    it('says what came out on Nov 1, 2026', () => {
      expect(textOf(paragraph(section(), s.lede))).toBe(s.lede);
    });

    it('links "GitHub prerelease" to the beta.1 release and "release queue" to the milestone', () => {
      expect(links(paragraph(section(), s.lede))).toEqual(s.links.map((l) => ({ label: l.label, href: l.href })));
    });

    it('lists the known limits and links the release notes', () => {
      const limits = paragraph(section(), s.limits);
      expect(textOf(limits)).toBe(s.limits);
      expect(links(limits)).toEqual(s.limitsLinks.map((l) => ({ label: l.label, href: l.href })));
    });

    it('says how to report a bug, and links the issue form and vivaryagent.xyz', () => {
      const bugs = paragraph(section(), s.bugs);
      expect(textOf(bugs)).toBe(s.bugs);
      expect(links(bugs)).toEqual(s.bugsLinks.map((l) => ({ label: l.label, href: l.href })));
    });

    it('links neither npm nor PyPI anywhere on the page, because the CLI is not the product', () => {
      expect(all(vivaryDoc(), 'a[href]').map((a) => attr(a, 'href')).filter((h) => /npmjs\.com|pypi\.org/.test(h ?? ''))).toEqual([]);
    });

    it('runs the status lede, the limits, then the bug note', () => {
      expect(inOrder(vivaryDoc(), [paragraph(section(), s.lede), paragraph(section(), s.limits), paragraph(section(), s.bugs)])).toBe(true);
    });
  });
});

describe('tool pages agree with each other', () => {
  it('shows the same Callout version on the home page and the Callout page, in the badge and in the facts plate', () => {
    const home = one(parsePage(page('home')), '#work');
    const fromHome = badges(home).find((b) => b.tone === 'shipped')?.label;
    const fromPage = badges(heroOf(calloutDoc()))[0]?.label;
    expect(fromPage).toMatch(RELEASED_PATTERN);
    expect(fromPage).toBe(fromHome);
    const versionRow = (root: El) => lanes(root, 'dl').find((row) => row.term === 'Version')?.detail;
    expect(versionRow(heroOf(calloutDoc())), 'the Version row on the Callout page').toBe(versionRow(home));
    expect(fromPage).toBe(`Released · ${versionRow(home)}`);
  });

  it('shows the same facts plate on the home page and the Callout page', () => {
    const rows = (root: El) => lanes(root, 'dl').map(({ term, detail }) => ({ term, detail }));
    expect(rows(heroOf(calloutDoc()))).toEqual(rows(one(parsePage(page('home')), '#work article.feature--reverse')));
  });

  it('shows the same Vivary status on the home page and the Vivary page', () => {
    const fromHome = badges(one(parsePage(page('home')), '#work')).find((b) => b.tone === 'wip')?.label;
    expect(badges(heroOf(vivaryDoc()))[0]?.label).toBe(fromHome);
  });

  it('links both tool pages from the home page buttons', () => {
    const hrefs = all(parsePage(page('home')), 'main a.btn').map((a) => attr(a, 'href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/callout/', '/vivary/']));
  });
});
