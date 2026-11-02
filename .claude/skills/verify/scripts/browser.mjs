// Browser journeys in the reviewed Chrome, on both sides:
//   build: astro preview of the branch under test
//   live:  replay.mjs serving the live.sh snapshot, production's own pages, stylesheets, fonts and images
// Rows: T3, T4, T9 (every request), T11, T17, T18, T23 (text visible on the rendered page),
// and the rendered parts of the redesign rows: T24, T25, T27, T29, T30, T32, T33, T34, T36, T37.
// Usage: node browser.mjs KEY_JSON BUILD_URL LIVE_REPLAY_URL WORK_DIR EVIDENCE_DIR
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [keyFile, buildUrl, liveUrl, work, evidence] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const { chromium } = createRequire(join(work, 'package.json'))('@playwright/test');
const CHROME = '/opt/google/chrome/chrome';
const SITE = 'https://littleaicompany.com';
const RELEASE = 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1';
// T34 names these three families and no others.
const FONTS = ['Dela Gothic One', 'Zen Kaku Gothic New', 'VT323'];
const LIGHT = key.pages.map((p) => p.path);
const DARK = key.dark.map((d) => d.path);
const NOT_FOUND = '/does-not-exist/';
const results = [];
const screens = join(evidence, 'screens');
mkdirSync(screens, { recursive: true });

function report(id, side, ok, name, details = []) {
  const row = key.rows.find((r) => r.id === id);
  if (!row) throw new Error(`check ${id} has no row in the key`);
  const verdict = ok ? 'PASS' : 'FAIL';
  results.push({ id, side, verdict, target: row.target, name, details });
  console.log(`${verdict.padEnd(7)} ${id.padEnd(4)} ${side.padEnd(5)} ${row.target ? '[target] ' : ''}${name}`);
  for (const d of details.slice(0, 15)) console.log(`        ${d}`);
}

// Colour helpers that run inside the page. inPage() prepends them to the function it evaluates.
const KIT = String.raw`
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const rgba = (c) => {
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) { const v = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [v[0], v[1], v[2], v[3] ?? 1]; }
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = c; probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
};
const over = (top, base) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
const lum = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
// The system colour Canvas, as the page's color-scheme resolves it.
const canvasColor = () => {
  const d = document.createElement('div');
  d.style.background = 'Canvas';
  document.documentElement.append(d);
  const c = rgba(getComputedStyle(d).backgroundColor);
  d.remove();
  return c;
};
// A ::before or ::after that fills its element, such as a highlight block behind text.
const cover = (n, pseudo) => {
  const cs = getComputedStyle(n, pseudo);
  if (cs.content === 'none' || cs.content === 'normal' || cs.position !== 'absolute') return null;
  return ['top', 'right', 'bottom', 'left'].every((k) => cs[k] === '0px') ? rgba(cs.backgroundColor) : null;
};
// The colour behind el: the nearest opaque background up the tree, with any translucent layers
// above it composited on, or Canvas when no ancestor is opaque. background-image is not read.
const behind = (el) => {
  const layers = [];
  for (let n = el; n; n = n.parentElement) {
    for (const bg of [cover(n, '::after'), cover(n, '::before'), rgba(getComputedStyle(n).backgroundColor)]) {
      if (!bg || bg[3] === 0) continue;
      layers.push(bg);
      if (bg[3] >= 1) return layers.reverse().reduce((base, top) => over(top, base));
    }
  }
  return layers.reverse().reduce((base, top) => over(top, base), canvasColor());
};
// Visible to a visitor: rendered, not transparent, larger than the 1px clip of a screen-reader-only
// element, and inside the page area a visitor can scroll to.
const seen = (el) => {
  const r = el.getBoundingClientRect();
  const page = document.documentElement;
  return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && r.width > 1 && r.height > 1 &&
    r.right + scrollX > 0 && r.bottom + scrollY > 0 && r.left + scrollX < page.scrollWidth && r.top + scrollY < page.scrollHeight;
};
// The text of el that seen() keeps, with a word break at every element that does not render inline.
const shownText = (el) => {
  const walk = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return seen(n.parentElement) ? n.data : ' ';
    if (n.nodeType !== Node.ELEMENT_NODE) return '';
    const inner = [...n.childNodes].map(walk).join('');
    const display = getComputedStyle(n).display;
    return n.tagName === 'BR' || !(display.startsWith('inline') || display === 'contents') ? ' ' + inner + ' ' : inner;
  };
  return el ? walk(el).replace(/\s+/g, ' ').trim() : '';
};
// Text nodes rendered with a box, outside svg. Off-page and 1px text stays in, so the rows that
// judge every text node judge more, not less. T30 leaves out aria-hidden text, as its row says.
const visibleTexts = (ariaHidden = false) => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const el = t.parentElement;
    if (!t.data.trim() || !el || el.closest('svg') || (!ariaHidden && el.closest('[aria-hidden="true"]'))) continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = document.createRange();
    r.selectNodeContents(t);
    const box = r.getBoundingClientRect();
    if (box.width >= 1 && box.height >= 1) out.push({ t, el });
  }
  return out;
};
const firstFamily = (cs) => cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
const label = (el) => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('href') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
`;
const inPage = (page, fn, arg = null) => page.evaluate(`(() => {${KIT}\nreturn (${fn})(${JSON.stringify(arg)});\n})()`);
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const sameRgb = (a, b) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);

// Chrome keeps its crash database under XDG dirs, so it gets fresh writable ones.
const home = mkdtempSync(join(tmpdir(), 'verify-chrome-'));
const env = { PATH: '/usr/bin:/bin', HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache') };
for (const d of [env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME]) mkdirSync(d, { mode: 0o700 });
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, env });
} catch (e) {
  console.log(`FAIL    BROWSER could not launch ${CHROME}: ${e.message.split('\n')[0]}`);
  console.log('BROWSER_RESULT=fail');
  process.exit(1);
}
const version = browser.version();
const navPages = key.pages.filter((p) => p.nav.startsWith('yes, label'));

async function journeys(side, base) {
  const origin = new URL(base).origin;
  // A replayed page may name production by its absolute URL. That is its own origin, not a third party.
  const own = (u) => u.startsWith(origin) || u.startsWith('data:') || u === SITE || u.startsWith(`${SITE}/`);
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const h1 = async () => (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ').trim();
  const shot = (name, fullPage = false) => page.screenshot({ path: join(screens, `${side}-${name}.png`), fullPage });
  // Opens a path. Returns true when it answered the status the page should have, and otherwise
  // adds the status to each row's details.
  const open = async (path, bads, want = 200) => {
    const res = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    if (res?.status() === want) return true;
    for (const bad of bads) bad.push(`${path} status ${res?.status()}`);
    return false;
  };

  // T3: each main nav link from the home page. The main nav is the nav in the site header, whatever
  // its accessible name. A label is the link text without a leading page number.
  {
    const bad = [];
    for (const target of navPages) {
      const name = /label "([^"]+)"/.exec(target.nav)[1];
      await page.goto(`${base}/`);
      if (!(await page.locator('header nav').count())) { bad.push('/ has no <nav> inside a <header>'); break; }
      const links = page.locator('header nav').getByRole('link');
      let link = null;
      for (let i = 0; i < (await links.count()) && !link; i++) {
        if ((await links.nth(i).innerText()).replace(/\s+/g, ' ').trim().replace(/^\d{3}\s*/, '') === name) link = links.nth(i);
      }
      if (!link) { bad.push(`no nav link labelled "${name}"`); continue; }
      await link.click();
      await page.waitForLoadState('load');
      const path = new URL(page.url()).pathname;
      const got = await h1();
      await shot(`T3-${name}`);
      if (path !== target.path) bad.push(`${name} landed on ${path}, expected ${target.path}`);
      if (got !== target.h1) bad.push(`${name} h1 "${got}", expected "${target.h1}"`);
      else if (!(await inPage(page, () => seen(document.querySelector('h1'))))) bad.push(`${name} h1 "${got}" is not visible`);
    }
    report('T3', side, bad.length === 0 && navPages.length > 0, `${navPages.length} nav links land on their page`, bad);
  }
  // T4: the header mark on /about/ goes home.
  {
    const bad = [];
    await page.goto(`${base}/about/`);
    const mark = page.locator('header a[href="/"]').first();
    if (!(await mark.count())) bad.push('no header link to /');
    else {
      await mark.click();
      await page.waitForLoadState('load');
      const path = new URL(page.url()).pathname;
      const homeH1 = key.pages.find((p) => p.path === '/').h1;
      if (path !== '/') bad.push(`landed on ${path}`);
      if ((await h1()) !== homeH1) bad.push(`h1 "${await h1()}"`);
      await shot('T4-mark');
    }
    report('T4', side, !bad.length, 'the header mark on /about/ goes to /', bad);
  }
  // T9 for the light pages and the 404 page, and its part of T24 for the dark pages: every
  // request goes to the page's own origin.
  const ownOnly = async (paths, want) => {
    const bad = [];
    for (const p of paths) {
      requests.length = 0;
      if (!(await open(p, [bad], want(p)))) continue;
      await shot(`T9${p.replaceAll('/', '_')}`, true);
      for (const u of requests) if (!own(u)) bad.push(`${p} requested ${u}`);
      if (requests.length === 0) bad.push(`${p} recorded no request at all`);
    }
    return bad;
  };
  {
    const bad = await ownOnly([...LIGHT, NOT_FOUND], (p) => (p === NOT_FOUND ? 404 : 200));
    report('T9', side, !bad.length, 'every page requests only its own origin (browser part)', bad);
  }
  {
    const bad = await ownOnly(DARK, () => 200);
    report('T24', side, !bad.length, `${DARK.length} dark pages answer 200 and request only their own origin (browser part)`, bad);
  }
  // T17 and T18: the release text and link are rendered and visible, not only present in the HTML.
  const visibleRelease = (root) => inPage(page, ([sel, release]) => {
    const el = sel ? document.querySelector(sel)?.closest('article, section') : document.body;
    if (!el) return { text: false, link: false, found: false };
    // The element that holds the version text must itself be visible, not only its section.
    const holders = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.data.includes('v0.1.0-beta.1')) holders.push(t.parentElement);
    return {
      found: true,
      text: holders.some(seen),
      link: [...el.querySelectorAll('a[href]')].some((a) => a.getAttribute('href') === release && seen(a) && a.innerText.trim() !== ''),
    };
  }, [root, RELEASE]);
  for (const [id, path, root, name] of [['T17', '/vivary/', null, '/vivary/ renders beta.1 and a visible release link'],
    ['T18', '/', '#feature-vivary', 'home Vivary section renders beta.1 and a visible release link']]) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    const v = await visibleRelease(root);
    const bad = [];
    if (!v.found) bad.push(`no ${root} section`);
    if (!v.text) bad.push('no visible "v0.1.0-beta.1" text');
    if (!v.link) bad.push(`no visible link to ${RELEASE}`);
    report(id, side, !bad.length, name, bad);
  }

  // One visit per page for the rows that read the rendered page.
  const bad = Object.fromEntries(['T11', 'T23', 'T24', 'T25', 'T30', 'T32', 'T33', 'T34', 'T37'].map((id) => [id, []]));
  const fonts = [];
  page.on('response', (r) => { if (r.request().resourceType() === 'font') fonts.push({ url: r.url(), status: r.status() }); });
  const paper = hexToRgb(key.lightTokens['--paper']);
  const pink = hexToRgb(key.lightTokens['--pink']);
  for (const path of [...LIGHT, NOT_FOUND, ...DARK]) {
    const dark = DARK.includes(path);
    const light = dark ? key.dark.find((d) => d.path === path).light : path;
    fonts.length = 0;
    // A dark route that is not a page yet counts against the redesign rows, not the invariants
    // T11 and T23. T24 reports its status.
    const rows = path === NOT_FOUND ? [bad.T11, bad.T25] : dark ? [bad.T25, bad.T30, bad.T32, bad.T33, bad.T34, bad.T37]
      : [bad.T11, bad.T23, bad.T25, bad.T30, bad.T32, bad.T33, bad.T34, bad.T37];
    if (!(await open(path, rows, path === NOT_FOUND ? 404 : 200))) continue;
    // T11, and its part of T24 on a dark page: the footer shows the privacy promise.
    if (!(await inPage(page, (want) => shownText(document.querySelector('footer')).includes(want), key.footer))) {
      (dark ? bad.T24 : bad.T11).push(`${path} footer does not show "${key.footer}"`);
    }
    // T23: the required strings are in the text of <main> a visitor sees.
    const required = key.required.find((r) => r.path === light);
    if (required) {
      const main = await inPage(page, () => shownText(document.querySelector('main')));
      for (const want of required.strings) if (!main.includes(want)) bad.T23.push(`${path} <main> does not show "${want}"`);
    }
    // T25: the variant link is visible and goes to the other variant of this page.
    {
      const [text, target] = dark ? ['Light version', light]
        : ['Dark version', key.dark.find((d) => d.light === (path === NOT_FOUND ? '/' : path)).path];
      const found = await inPage(page, ([want, to]) => [...document.querySelectorAll('a[href]')].some((a) =>
        a.innerText.replace(/\s+/g, ' ').trim() === want && new URL(a.href).pathname === to && seen(a)), [text, target]);
      if (!found) bad.T25.push(`${path} renders no visible "${text}" link to ${target}`);
    }
    if (path === NOT_FOUND) continue;
    // T32: each token's effective value on the page is the value in its variant's tokens table.
    {
      const want = dark ? key.darkTokens : key.lightTokens;
      const got = await inPage(page, (names) => names.map((n) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
        return [n, v, v && CSS.supports('color', v) ? rgba(v) : null];
      }), Object.keys(want));
      for (const [name, v, rgb] of got) {
        if (!rgb || rgb[3] !== 1 || hexToRgb(want[name]).some((c, i) => c !== rgb[i])) bad.T32.push(`${path} ${name} computes to "${v}", expected ${want[name]}`);
      }
    }
    // T30 contrast, and T32's rule that pink text on paper is only --pink-text on light pages.
    const texts = await inPage(page, () => visibleTexts().map(({ t, el }) => {
      const cs = getComputedStyle(el);
      const ground = behind(el);
      const fg = over(rgba(cs.color), ground);
      const size = parseFloat(cs.fontSize);
      return { text: t.data.replace(/\s+/g, ' ').trim().slice(0, 30), fg, ground, ratio: ratio(fg, ground), hexes: `${hex(fg)} on ${hex(ground)}`,
        large: size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700) };
    }));
    if (!texts.length) bad.T30.push(`${path} has no visible text`);
    for (const t of texts) {
      const min = t.large ? 3 : 4.5;
      if (t.ratio < min) bad.T30.push(`${path} "${t.text}" ${t.ratio.toFixed(2)}:1 < ${min}:1, ${t.hexes}`);
      if (!dark && sameRgb(t.fg, pink) && sameRgb(t.ground, paper)) bad.T32.push(`${path} "${t.text}" is --pink text on --paper, ${t.hexes}`);
    }
    // T33: no radius, no blur, no gradient but halftone dots. Pseudo-elements count as elements.
    bad.T33.push(...(await inPage(page, () => {
      const out = [];
      const blur = (shadow) => shadow.split(/,(?![^(]*\))/).map((s) => s.replace(/[a-z-]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? [])
        .some((v) => parseFloat(v[2] ?? '0') > 0);
      const smallTile = (size) => size.split(',').every((s) => /^\s*[\d.]+px(\s+[\d.]+px)?\s*$/.test(s) && s.match(/[\d.]+/g).every((v) => parseFloat(v) <= 32));
      for (const el of document.querySelectorAll('html, body, body *')) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
          const where = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}${pseudo ?? ''}`;
          const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
          if (radii.some((r) => r !== '0px')) out.push(`${where} border-radius ${cs.borderRadius}`);
          if (cs.boxShadow !== 'none' && blur(cs.boxShadow)) out.push(`${where} box-shadow ${cs.boxShadow}`);
          if (cs.textShadow !== 'none' && blur(cs.textShadow)) out.push(`${where} text-shadow ${cs.textShadow}`);
          for (const f of ['filter', 'backdropFilter']) if (/blur\(/.test(cs[f])) out.push(`${where} ${f} ${cs[f]}`);
          if (/(linear|conic)-gradient/.test(cs.backgroundImage)) out.push(`${where} ${cs.backgroundImage.slice(0, 60)}`);
          if (/radial-gradient/.test(cs.backgroundImage) && !smallTile(cs.backgroundSize)) out.push(`${where} radial-gradient on a ${cs.backgroundSize} tile, not halftone dots`);
        }
      }
      return [...new Set(out)];
    })).map((d) => `${path} ${d}`));
    // T34: the three families, each a woff2 from this origin, body in Zen Kaku Gothic New, VT323 at 20px and up.
    {
      const f = await inPage(page, async () => {
        await document.fonts.ready;
        const rules = [];
        const walk = (list) => { for (const r of list) { if (r instanceof CSSFontFaceRule) rules.push(r); else if (r.cssRules) walk(r.cssRules); } };
        const unreadable = [];
        for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { unreadable.push(sh.href); } }
        // T34 has no aria-hidden exception, so decorative text counts.
        const texts = visibleTexts(true).map(({ t, el }) => ({ text: t.data.trim().slice(0, 30), cs: getComputedStyle(el) }));
        return {
          unreadable,
          faces: rules.map((r) => ({ family: r.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, ''),
            srcs: [...r.style.getPropertyValue('src').matchAll(/(url|local)\(\s*["']?([^"')]*)/g)].map((m) => (m[1] === 'local' ? `local(${m[2]})` : m[2].slice(0, 80))) })),
          body: firstFamily(getComputedStyle(document.body)),
          loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/^["']|["']$/g, '')),
          small: texts.filter(({ cs }) => firstFamily(cs) === 'VT323' && parseFloat(cs.fontSize) < 20).map(({ text, cs }) => `"${text}" ${cs.fontSize}`),
          used: texts.map(({ text, cs }) => [text, firstFamily(cs)]),
        };
      });
      const b = bad.T34;
      for (const u of f.unreadable) b.push(`${path} stylesheet ${u} unreadable`);
      for (const face of f.faces) {
        if (!FONTS.includes(face.family)) b.push(`${path} @font-face "${face.family}" is not one of ${FONTS.join(', ')}`);
        for (const src of face.srcs) {
          if (src.startsWith('local(') || src.startsWith('data:')) { b.push(`${path} "${face.family}" src ${src.slice(0, 40)} is not a woff2 file`); continue; }
          const u = new URL(src, `${base}${path}`);
          if (u.origin !== origin || !/\.woff2$/.test(u.pathname)) b.push(`${path} "${face.family}" src ${u.href} is not a woff2 file from this origin`);
        }
      }
      for (const r of fonts) {
        const u = new URL(r.url);
        if (r.status !== 200) b.push(`${path} font ${u.pathname} answered ${r.status}${side === 'live' ? ', not kept by live.sh?' : ''}`);
        if (u.origin !== origin || !/\.woff2$/.test(u.pathname)) b.push(`${path} font ${r.url} is not a woff2 file from this origin`);
      }
      if (f.body !== 'Zen Kaku Gothic New') b.push(`${path} body font-family starts "${f.body}"`);
      else if (!f.loaded.includes('Zen Kaku Gothic New')) b.push(`${path} Zen Kaku Gothic New never loaded`);
      for (const s of f.small) b.push(`${path} VT323 text below 20px: ${s}`);
      const families = new Map();
      for (const [text, fam] of f.used) if (!families.has(fam)) families.set(fam, text);
      for (const [fam, text] of families) {
        if (!FONTS.includes(fam)) b.push(`${path} text "${text}" is set in "${fam}", not one of ${FONTS.join(', ')}`);
        else if (!f.loaded.includes(fam)) b.push(`${path} text "${text}" is set in "${fam}", which never loaded`);
      }
    }
    // T37: the first Tab stop is a skip link to #main, and every focused link or button shows an outline.
    {
      await page.keyboard.press('Tab');
      const first = await page.evaluate(() => {
        const el = document.activeElement;
        return { href: el?.getAttribute('href') ?? null, tag: el?.tagName, main: Boolean(document.getElementById('main')) };
      });
      if (first.tag !== 'A' || first.href !== '#main') bad.T37.push(`${path} first Tab stop is <${(first.tag ?? 'none').toLowerCase()} href="${first.href}">, not a skip link to #main`);
      if (!first.main) bad.T37.push(`${path} has no #main`);
      let stops = 0;
      for (; stops < 200; stops++) {
        const f = await inPage(page, () => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          if (el.verifySeen) return { again: true };
          el.verifySeen = true;
          const cs = getComputedStyle(el);
          const ground = behind(el.parentElement ?? el);
          const color = over(rgba(cs.outlineColor), ground);
          return { tag: el.tagName, label: label(el), seen: seen(el), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth),
            alpha: rgba(cs.outlineColor)[3], differs: ratio(color, ground) > 1.01, hexes: `${hex(color)} on ${hex(ground)}` };
        });
        if (!f || f.again) break;
        if (!['A', 'BUTTON'].includes(f.tag)) { await page.keyboard.press('Tab'); continue; }
        if (!f.seen) bad.T37.push(`${path} "${f.label}" is focused but not visible on the page`);
        else if (f.style === 'none' || f.width < 1 || f.alpha === 0) bad.T37.push(`${path} "${f.label}" focused with outline ${f.style} ${f.width}px`);
        else if (!f.differs) bad.T37.push(`${path} "${f.label}" outline is the colour behind it, ${f.hexes}`);
        await page.keyboard.press('Tab');
      }
      if (stops < 2) bad.T37.push(`${path} Tab reached ${stops} element(s)`);
    }
  }
  page.removeAllListeners('response');
  report('T11', side, !bad.T11.length, 'every light page and the 404 page show the footer promise (browser part)', bad.T11);
  report('T23', side, !bad.T23.length, `${key.required.length} pages and their serving dark pages show their required strings in <main> (browser part)`, bad.T23);
  report('T24', side, !bad.T24.length, 'every serving dark page shows the footer promise (browser part)', bad.T24);
  report('T25', side, !bad.T25.length, 'the variant links render and are visible (browser part)', bad.T25);
  report('T30', side, !bad.T30.length, 'visible text meets WCAG AA contrast on every light and dark page', bad.T30);
  report('T32', side, !bad.T32.length, 'tokens compute to the key\'s values, and no --pink text on --paper on light pages (browser part)', bad.T32);
  report('T33', side, !bad.T33.length, 'no radius, blur or gradient except halftone dots', bad.T33);
  report('T34', side, !bad.T34.length, 'only the three fonts, woff2 from this origin, body Zen Kaku, VT323 at 20px and up', bad.T34);
  report('T37', side, !bad.T37.length, 'skip link first, and a visible focus outline on every link and button', bad.T37);

  // T27: the light page ignores the OS colour setting.
  {
    const b = [];
    for (const path of ['/', '/vivary/']) for (const scheme of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: scheme });
      if (!(await open(path, [b]))) continue;
      const got = await page.evaluate(() => ({ meta: document.querySelector('meta[name="color-scheme"]')?.content ?? null, bg: getComputedStyle(document.body).backgroundColor }));
      if (got.meta !== 'light') b.push(`${path} with the OS ${scheme}: meta color-scheme "${got.meta}", expected "light"`);
      const bg = await inPage(page, (c) => rgba(c), got.bg);
      if (!sameRgb(bg, paper) || bg[3] !== 1) b.push(`${path} with the OS ${scheme}: body background ${got.bg}, expected ${key.lightTokens['--paper']}`);
    }
    await page.emulateMedia({ colorScheme: null });
    report('T27', side, !b.length, '/ and /vivary/ stay light under both OS colour settings', b);
  }
  // T29: no bright flash on a dark page, with stylesheets blocked and then allowed.
  {
    const b = [];
    let aborted = 0;
    for (const blocked of [true, false]) {
      if (blocked) await page.route('**/*', (r) => (r.request().resourceType() === 'stylesheet' ? (aborted++, r.abort()) : r.continue()));
      for (const path of DARK) {
        if (!(await open(path, [b]))) continue;
        const g = await inPage(page, () => {
          const html = rgba(getComputedStyle(document.documentElement).backgroundColor);
          const body = rgba(getComputedStyle(document.body).backgroundColor);
          const [from, c] = html[3] > 0 ? ['html', html] : body[3] > 0 ? ['body', body] : ['Canvas', canvasColor()];
          const ground = c[3] < 1 ? over(c, canvasColor()) : c;
          return { from, hex: hex(ground), lum: lum(ground) };
        });
        if (g.lum > 0.05) b.push(`${path} stylesheets ${blocked ? 'blocked' : 'allowed'}: ground from ${g.from} is ${g.hex}, luminance ${g.lum.toFixed(3)} > 0.05`);
      }
      if (blocked) await page.unrouteAll();
    }
    report('T29', side, !b.length, `the dark ground is dark with stylesheets blocked (${aborted} requests) and allowed`, b);
  }
  // T36: no horizontal scroll, and 44 by 44 px targets. Only a link inside a sentence of running
  // text is exempt, never a button.
  {
    const b = [];
    const dark = (light) => key.dark.find((d) => d.light === light).path;
    for (const path of ['/', '/vivary/', dark('/'), dark('/vivary/')]) for (const width of [360, 390, 860, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (!(await open(path, [b]))) break;
      const found = await inPage(page, () => {
        const out = [];
        const d = document.documentElement;
        if (d.scrollWidth > d.clientWidth) out.push(`scrolls sideways, ${d.scrollWidth} > ${d.clientWidth}`);
        // A sentence of running text: the link renders inline, its nearest block is a paragraph,
        // list item, definition, table cell, quote or caption laid out as flow, and that block shows
        // at least two words outside its links and buttons. A heading row or a flex row of controls
        // is not a sentence.
        const PROSE = new Set(['P', 'LI', 'DD', 'TD', 'BLOCKQUOTE', 'FIGCAPTION']);
        const inSentence = (a) => {
          if (!getComputedStyle(a).display.startsWith('inline')) return false;
          let block = a.parentElement;
          while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
          if (!block || !PROSE.has(block.tagName) || !['block', 'list-item', 'table-cell'].includes(getComputedStyle(block).display)) return false;
          let words = 0;
          const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
          for (let t = w.nextNode(); t; t = w.nextNode()) {
            if (!t.parentElement.closest('a, button, [role="button"]') && seen(t.parentElement)) words += (t.data.match(/\p{L}{2,}/gu) ?? []).length;
          }
          return words >= 2;
        };
        for (const el of document.querySelectorAll('a[href], button, [role="button"]')) {
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          const r = el.getBoundingClientRect();
          if ((r.width === 0 && r.height === 0) || (r.width >= 44 && r.height >= 44) || (el.matches('a[href]:not([role="button"])') && inSentence(el))) continue;
          out.push(`"${label(el)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out;
      });
      b.push(...found.map((d) => `${path} at ${width}px ${d}`));
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    report('T36', side, !b.length, 'no sideways scroll and 44 px targets at 360, 390, 860 and 1440', b);
  }
  await page.close();
}

await journeys('build', buildUrl);
await journeys('live', liveUrl);
await browser.close();
writeFileSync(join(evidence, 'browser.json'), JSON.stringify({ chrome: version, results }, null, 1));
const failed = results.filter((r) => r.verdict === 'FAIL' && !r.target).length;
const targets = (side) => results.filter((r) => r.side === side && r.target && r.verdict === 'FAIL').length;
console.log(`BROWSER_RESULT=${failed ? 'fail' : 'pass'} failed=${failed} targets_failed_build=${targets('build')} targets_failed_live=${targets('live')} chrome ${version} screenshots ${screens}`);
process.exit(failed ? 1 : 0);
