/**
 * The built markup runs no script and needs none: the site promises zero client JavaScript, so
 * nothing on a page may depend on it.
 */
import { describe, expect, it } from 'vitest';
import { all, show } from '../helpers/dom';
import { PAGE_CASES, parsePage, readDist } from '../helpers/dist';
import { visibleText } from '../helpers/text';

describe.each(PAGE_CASES)('markup of %s', (_label, info) => {
  const doc = () => parsePage(info);

  it('ships no <script> and no <noscript>', () => {
    expect(readDist(info.file)).not.toMatch(/<script/i);
    expect(all(doc(), 'script, noscript').map(show)).toEqual([]);
  });

  it('has no javascript: URLs and no inline event handlers', () => {
    const bad: string[] = [];
    for (const el of all(doc(), '*')) {
      for (const [name, value] of Object.entries(el.attributes)) {
        if (/^on[a-z]+$/i.test(name)) bad.push(`${show(el)} has ${name}`);
        if (/^\s*javascript:/i.test(value)) bad.push(`${show(el)} has a javascript: URL`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has nothing that needs script: no buttons, forms, inputs, dialogs, embeds or toggles', () => {
    const needsScript = 'button, form, input, select, textarea, dialog, iframe, object, embed, video, audio, [aria-expanded], [aria-haspopup], [role="switch"], [role="button"]';
    expect(all(doc(), needsScript).map(show)).toEqual([]);
  });

  it('has no duplicate ids', () => {
    const ids = all(doc(), '[id]').map((el) => el.getAttribute('id') ?? '');
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('has no empty links and no empty paragraphs', () => {
    expect(all(doc(), 'a').filter((a) => visibleText(a) === '' && !a.querySelector('svg[aria-label], img[alt]')).map(show)).toEqual([]);
    expect(all(doc(), 'main p').filter((p) => visibleText(p) === '').map(show)).toEqual([]);
  });

  it('labels every svg that is not hidden from assistive technology', () => {
    const bad = all(doc(), 'body svg').filter((svg) => svg.getAttribute('aria-hidden') !== 'true' && !(svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label')));
    expect(bad.map(show)).toEqual([]);
  });
});
