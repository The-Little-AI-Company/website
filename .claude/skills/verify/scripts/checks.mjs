// Judges every http, html, links and parity row of the key, on two sides:
//   build: the branch under test, served by astro preview from its own dist/
//   live:  a production snapshot that live.sh collected
// Usage: node checks.mjs KEY_JSON BUILD_URL DIST_DIR PUBLIC_DIR LIVE_DIR WORK_DIR EVIDENCE_DIR
// PUBLIC_DIR is REPO/public. T31 reads REPO/.github/workflows beside it.
// Expected values come from the key or from the live snapshot, never from the build.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const [keyFile, buildUrl, dist, publicDir, liveDir, work, evidence] = process.argv.slice(2);
const { parse } = createRequire(join(work, 'package.json'))('node-html-parser');
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const SITE = 'https://littleaicompany.com';
const RELEASE = 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1';
const MAX_SNAPSHOT_AGE_S = 6 * 3600;
const results = [];

// A row the key marks as a target counts apart from the invariants. KNOWN only for listed paths.
function report(id, side, ok, name, details = []) {
  const row = key.rows.find((r) => r.id === id);
  if (!row) throw new Error(`check ${id} has no row in the key`);
  let verdict = ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL';
  if (verdict === 'FAIL' && !row.target && details.length &&
      details.every((d) => key.known.some((k) => d.includes(k.path)))) verdict = 'KNOWN';
  results.push({ id, side, verdict, target: row.target, name, details });
  console.log(`${verdict.padEnd(7)} ${id.padEnd(4)} ${side.padEnd(5)} ${row.target ? '[target] ' : ''}${name}`);
  for (const d of details.slice(0, 15)) console.log(`        ${d}`);
}

const EM_DASH = String.fromCodePoint(0x2014);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole word, case-insensitive, letters and digits only count as word characters.
const word = (term) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(term)}(?![\\p{L}\\p{N}])`, 'iu');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
// Text the way a reader sees word boundaries: a block element or <br> separates words, inline
// elements do not ("Hoo<span>lio</span>" stays one word, "<p>Zo</p><p>Company</p>" is two).
const BLOCKS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'CAPTION', 'DD', 'DETAILS', 'DIALOG', 'DIV', 'DL',
  'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR',
  'LI', 'MAIN', 'NAV', 'OL', 'OPTION', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD',
  'TITLE', 'TR', 'UL']);
function textOf(el, skip) {
  if (!el) return '';
  const walk = (n) => {
    if (n.nodeType === 3) return n.text;
    if (skip(n)) return ' ';
    const inner = n.childNodes.map(walk).join('');
    return BLOCKS.has(n.tagName) ? ` ${inner} ` : inner;
  };
  return walk(el).replace(/\s+/g, ' ').trim();
}
// All text, hidden parts included.
const text = (el) => textOf(el, () => false);

// ---------- the two sides as one shape ----------
const PATHS = { home: '/', callout: '/callout/', vivary: '/vivary/', about: '/about/', contact: '/contact/' };
const nameOf = (path) => Object.keys(PATHS).find((n) => PATHS[n] === path);
// The key's dark routes, named after their light page: /dark/callout/ is dark-callout, as in live.sh.
const DARK = Object.fromEntries(key.dark.map((d) => [`dark-${nameOf(d.light)}`, d.path]));
const LIGHT_OF = Object.fromEntries(key.dark.map((d) => [`dark-${nameOf(d.light)}`, d.light]));
const pathOf = (n) => PATHS[n] ?? DARK[n] ?? '/does-not-exist/';
const isDarkPath = (path) => path === '/dark' || path.startsWith('/dark/');

async function buildSide() {
  // Every response the judge reads, pages and assets, is kept for T8's cookie check.
  const cookies = [];
  const get = async (path) => {
    const res = await fetch(buildUrl + path, { redirect: 'manual' });
    if (res.headers.has('set-cookie') && !cookies.includes(path)) cookies.push(path);
    return { status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
  };
  const pages = {};
  for (const [name, path] of [...Object.entries(PATHS), ...Object.entries(DARK)]) pages[name] = await get(path);
  pages.notfound = await get('/does-not-exist/');
  pages.robots = await get('/robots.txt');
  pages.sitemap = await get('/sitemap.xml');
  const sheet = async (u) => { const r = await get(u); return r.status === 200 ? r.body : null; };
  return { name: 'build', pages, get, sheet, assetCookies: () => cookies };
}

function liveSide() {
  try {
    return readLive();
  } catch (e) {
    console.log(`FAIL    LIVE  live snapshot unreadable: ${e.message.split('\n')[0]}`);
    return null;
  }
}

function readLive() {
  if (!existsSync(join(liveDir, 'pages.tsv'))) return null;
  const age = Date.now() / 1000 - Number(/epoch (\d+)/.exec(readFileSync(join(liveDir, 'meta.txt'), 'utf8'))[1]);
  const pages = {};
  for (const line of readFileSync(join(liveDir, 'pages.tsv'), 'utf8').trim().split('\n')) {
    const [name, , status] = line.split('\t');
    const file = join(liveDir, 'pages', name);
    const headers = {};
    for (const h of (existsSync(`${file}.headers`) ? readFileSync(`${file}.headers`, 'utf8') : '').split(/\r?\n/)) {
      const m = /^([^:]+):\s*(.*)$/.exec(h);
      if (m) headers[m[1].toLowerCase()] = m[2];
    }
    pages[name] = { status: Number(status), headers, body: existsSync(file) ? readFileSync(file, 'utf8') : '' };
  }
  const tsv = (f) => readFileSync(join(liveDir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
  for (const name of ['home', 'callout', 'vivary', 'about', 'contact', 'notfound', 'robots', 'sitemap']) {
    if (!pages[name]?.body) throw new Error(`page ${name} missing from the snapshot`);
  }
  const site = /^site (\S+)/m.exec(readFileSync(join(liveDir, 'meta.txt'), 'utf8'))?.[1] ?? SITE;
  const cookieFile = join(liveDir, 'asset-cookies.tsv');
  const assetCookies = () => (existsSync(cookieFile) ? readFileSync(cookieFile, 'utf8').split('\n').filter(Boolean) : null);
  const css = readFileSync(join(liveDir, 'css.txt'), 'utf8');
  // css.txt is every kept stylesheet, each after a /* path */ line.
  const parts = css.split(/^\/\* (\S+) \*\/$/m);
  const sheets = [];
  for (let i = 1; i < parts.length; i += 2) sheets.push({ where: parts[i], text: parts[i + 1] });
  const sheet = (u) => { const f = join(liveDir, 'files', u.split('?')[0]); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
  return { name: 'live', site, pages, age, assetCookies, sameOrigin: tsv('same-origin.tsv'), external: tsv('external.tsv'), css, sheets, sheet };
}

// Elements that make the browser fetch something, and the attribute holding the URL. The same
// list as tests/unit/third-party.test.ts, so live production is held to the build's rule.
const LOADERS = [
  ['script[src]', 'src'], ['link[href]', 'href'], ['img[src]', 'src'], ['source[src]', 'src'], ['iframe[src]', 'src'],
  ['video[src]', 'src'], ['video[poster]', 'poster'], ['audio[src]', 'src'], ['embed[src]', 'src'], ['object[data]', 'data'],
  ['track[src]', 'src'], ['meta[property="og:image"]', 'content'],
];
const NOT_FETCHED = /^(mailto:|tel:|data:|javascript:|#)/i;
// Every URL in a string of CSS.
const cssUrls = (css) => [...css.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)].map((m) => m[1].trim());
// Resolves a reference the way a browser does, against the page or stylesheet that holds it.
// Same-origin URLs come back as a path, others as an absolute URL. null for a URL nothing fetches.
function resolveRef(ref, base) {
  if (!ref || NOT_FETCHED.test(ref.trim())) return null;
  const u = new URL(ref.trim(), base);
  u.hash = '';
  return u.origin === SITE ? u.pathname + u.search : u.href;
}
const isOwn = (u) => u.startsWith('/');
const isManifest = (u) => /(\.webmanifest|\/manifest\.json)$/.test(u.split('?')[0]);
// The icons a web app manifest names, resolved against the manifest's own URL. null when the
// manifest is not JSON, which T5 reports as a broken asset.
function manifestIcons(body, manifestPath) {
  let icons;
  try { icons = JSON.parse(body).icons ?? []; } catch { return null; }
  return icons.map((i) => resolveRef(i.src, SITE + manifestPath)).filter(Boolean);
}
// URLs a page loads or links: every href, src, poster, data and srcset candidate, the og:image,
// and url() in style attributes and <style> blocks. pagePath is where the page is served.
function urlsOf(doc, pagePath) {
  const base = SITE + pagePath;
  const refs = [];
  for (const el of doc.querySelectorAll('[href],[src],[poster],object[data]')) {
    for (const a of ['href', 'src', 'poster', 'data']) if (el.getAttribute(a)) refs.push(el.getAttribute(a));
  }
  for (const el of doc.querySelectorAll('[srcset]')) for (const part of el.getAttribute('srcset').split(',')) refs.push(part.trim().split(/\s+/)[0]);
  for (const el of doc.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')) refs.push(el.getAttribute('content'));
  for (const el of doc.querySelectorAll('[style]')) refs.push(...cssUrls(el.getAttribute('style')));
  for (const el of doc.querySelectorAll('style')) refs.push(...cssUrls(el.text));
  return [...new Set(refs.map((r) => resolveRef(r, base)).filter(Boolean))];
}
// Resources a page makes the browser load from another origin. Links a visitor may click are not
// loads, so plain anchors are not in this list.
function foreignLoads(doc, pagePath) {
  const base = SITE + pagePath;
  const out = [];
  const check = (ref, where) => { const u = resolveRef(ref, base); if (u && !isOwn(u)) out.push(`${where} -> ${u}`); };
  for (const [selector, attribute] of LOADERS) for (const el of doc.querySelectorAll(selector)) check(el.getAttribute(attribute), `<${el.rawTagName} ${attribute}>`);
  for (const el of doc.querySelectorAll('img[srcset],source[srcset]')) for (const part of el.getAttribute('srcset').split(',')) check(part.trim().split(/\s+/)[0], `<${el.rawTagName} srcset>`);
  for (const el of doc.querySelectorAll('[style]')) for (const u of cssUrls(el.getAttribute('style'))) check(u, 'style attribute url()');
  for (const el of doc.querySelectorAll('style')) {
    if (/@import/i.test(el.text)) out.push('<style> @import');
    for (const u of cssUrls(el.text)) check(u, '<style> url()');
  }
  return out;
}

// Text a visitor can see without CSS: skips hidden subtrees, inline display:none or
// visibility:hidden, and elements that never render. browser.mjs checks the rendered page too.
const NEVER_RENDERED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD']);
function isHidden(el) {
  if (!el.getAttribute) return false;
  if (NEVER_RENDERED.has(el.tagName) || el.getAttribute('hidden') !== undefined) return true;
  return /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0*\.?0*\s*(;|!|$))/i.test(el.getAttribute('style') ?? '');
}
const visibleText = (el) => textOf(el, isHidden);
const shown = (el, root) => { for (let n = el; n && n !== root; n = n.parentNode) if (isHidden(n)) return false; return true; };

// ---------- rows ----------
async function judge(side) {
  const p = side.pages;
  const doc = Object.fromEntries(Object.entries(p).map(([n, v]) => [n, parse(v.body, { comment: false })]));
  const s = side.name;
  const lightNames = Object.keys(PATHS);
  const htmlPages = [...lightNames, 'notfound'];
  // A dark route that does not answer 200 is not a page yet. Rows that need it say so once each.
  const darkNames = Object.keys(DARK);
  const darkUp = darkNames.filter((n) => p[n]?.status === 200);
  const darkDown = darkNames.filter((n) => p[n]?.status !== 200)
    .map((n) => `${DARK[n]} status ${p[n] ? p[n].status : 'missing, not collected by live.sh'}`);

  // The CSS a page applies: its <style> blocks and its same-origin stylesheets. text is null for a
  // stylesheet this side cannot read.
  const pageCss = async (n) => {
    const out = doc[n].querySelectorAll('style').map((el) => ({ where: `${pathOf(n)} <style>`, text: el.text }));
    for (const l of doc[n].querySelectorAll('link[rel~="stylesheet"][href]')) {
      const u = resolveRef(l.getAttribute('href'), SITE + pathOf(n));
      if (u && isOwn(u)) out.push({ where: u, text: await side.sheet(u) });
    }
    return out;
  };

  // T5 for a set of pages. Build: every same-origin URL the pages, their stylesheets and their
  // manifest name, requested now. Live: the same URLs, read from what live.sh collected.
  const buildAssets = async (names) => {
    const own = new Set();
    const ext = new Set();
    const bad = [];
    for (const n of names) for (const u of urlsOf(doc[n], pathOf(n))) (isOwn(u) ? own : ext).add(u);
    for (const u of [...own]) if (u.split('?')[0].endsWith('.css')) {
      for (const ref of cssUrls((await side.get(u)).body)) { const r = resolveRef(ref, SITE + u); if (r) (isOwn(r) ? own : ext).add(r); }
    }
    for (const u of [...own]) if (isManifest(u)) {
      const icons = manifestIcons((await side.get(u)).body, u);
      if (!icons) bad.push(`manifest ${u} is not JSON`);
      for (const i of icons ?? []) (isOwn(i) ? own : ext).add(i);
    }
    for (const u of own) { const r = await side.get(u); if (r.status !== 200) bad.push(`${r.status} ${u}`); }
    return { own, ext, bad };
  };
  // live.sh collects with grep. The parser decides what it had to collect: every same-origin URL
  // in the pages, in their stylesheets and in their manifest needs a status in same-origin.tsv.
  const liveAssets = (names) => {
    const bad = [];
    const siteOrigin = new URL(side.site).origin;
    const local = (u) => { const x = new URL(u); return x.origin === siteOrigin ? x.pathname + x.search : u; };
    const collected = new Map(side.sameOrigin.map(([c, u]) => [local(u), c]));
    const own = new Set();
    for (const n of names) for (const u of urlsOf(doc[n], pathOf(n))) if (isOwn(u)) own.add(u);
    const kept = (u, kind) => {
      const body = side.sheet(u);
      if (body === null) bad.push(`${kind} ${u} not kept by live.sh`);
      return body;
    };
    for (const u of [...own]) if (u.split('?')[0].endsWith('.css')) {
      const body = kept(u, 'stylesheet');
      for (const ref of body === null ? [] : cssUrls(body)) { const r = resolveRef(ref, SITE + u); if (r && isOwn(r)) own.add(r); }
    }
    for (const u of [...own]) if (isManifest(u)) {
      const body = kept(u, 'manifest');
      if (body === null) continue;
      const icons = manifestIcons(body, u);
      if (!icons) bad.push(`manifest ${u} is not JSON`);
      for (const i of icons ?? []) if (isOwn(i)) own.add(i);
    }
    for (const u of own) {
      const c = collected.get(u);
      if (c === undefined) bad.push(`not collected by live.sh: ${u}`);
      else if (c !== '200') bad.push(`${c} ${u}`);
    }
    return { own, bad };
  };
  const scripted = (names) => names.filter((n) => /<script/i.test(p[n].body));
  const storage = (names) => names.filter((n) => /document\.cookie|localStorage|sessionStorage|navigator\.sendBeacon/.test(p[n].body));
  const footerless = (names) => names.filter((n) => !text(doc[n].querySelector('footer')).includes(key.footer));
  // T9's html part for a set of pages: no resource from another origin in any loader, no
  // connection hint, nothing foreign in any stylesheet.
  const foreign = async (names) => {
    const bad = [];
    for (const n of names) {
      for (const f of foreignLoads(doc[n], pathOf(n))) bad.push(`${n} ${f}`);
      for (const l of doc[n].querySelectorAll('link[rel]')) {
        if (/\b(preconnect|dns-prefetch|prefetch|prerender)\b/.test(l.getAttribute('rel'))) bad.push(`${n} ${l.toString()}`);
      }
    }
    const sheets = new Set(names.flatMap((n) => doc[n].querySelectorAll('link[rel~="stylesheet"][href]')
      .map((l) => resolveRef(l.getAttribute('href'), SITE + pathOf(n))).filter((u) => u && isOwn(u))));
    const cssText = s === 'live' ? side.css : (await Promise.all([...sheets].map(async (u) => (await side.get(u)).body))).join('\n');
    if (!sheets.size || !cssText.trim()) bad.push('no stylesheet text to check');
    if (/@import/i.test(cssText)) bad.push('CSS @import');
    for (const u of cssUrls(cssText)) if (/^(https?:)?\/\//i.test(u) && !resolveRef(u, SITE + '/').startsWith('/')) bad.push(`CSS url ${u}`);
    return bad;
  };
  const owlish = (names) => {
    const bad = [];
    for (const n of names) {
      const strings = [text(doc[n].querySelector('body'))];
      for (const el of doc[n].querySelectorAll('[alt],[title],[aria-label]')) for (const a of ['alt', 'title', 'aria-label']) strings.push(el.getAttribute(a) ?? '');
      strings.push(text(doc[n].querySelector('title')));
      for (const t of ['owl', 'Hoolio']) if (strings.some((x) => word(t).test(x))) bad.push(`${n} has "${t}"`);
    }
    return bad;
  };

  // T1: every page 200, h1 matches the key's Pages table.
  {
    const bad = [];
    for (const pg of key.pages) {
      const name = nameOf(pg.path);
      const h1 = text(doc[name]?.querySelector('h1'));
      if (p[name]?.status !== 200) bad.push(`${pg.path} status ${p[name]?.status}`);
      if (h1 !== pg.h1) bad.push(`${pg.path} h1 "${h1}" expected "${pg.h1}"`);
    }
    report('T1', s, !bad.length, 'every page returns 200 with the h1 from the key', bad);
  }
  // T2: 404 page.
  {
    const nf = doc.notfound;
    const bad = [];
    if (p.notfound.status !== 404) bad.push(`status ${p.notfound.status}`);
    if (!nf.querySelector('header')) bad.push('no header');
    if (!nf.querySelector('footer')) bad.push('no footer');
    report('T2', s, !bad.length, '/does-not-exist/ returns 404 with header and footer', bad);
  }
  // T5 and T6: same-origin links and assets, then external links.
  if (s === 'build') {
    const { own, ext, bad } = await buildAssets(htmlPages);
    report('T5', s, !bad.length, `${own.size} same-origin links and assets return 200`, bad);
    const fails = [];
    const warns = [];
    for (const u of ext) {
      try {
        const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { range: 'bytes=0-0' } });
        if (r.status >= 500) fails.push(`${r.status} ${u}`); else if (r.status >= 400) warns.push(`${r.status} ${u}`);
        await r.body?.cancel();
      } catch (e) { warns.push(`network ${e.cause?.code ?? e.name} ${u}`); }
    }
    report('T6', s, fails.length ? false : warns.length ? 'warn' : true, `${ext.size} external links, ${fails.length} 5xx, ${warns.length} other failures`, [...fails, ...warns]);
  } else {
    const { own, bad } = liveAssets(htmlPages);
    report('T5', s, side.sameOrigin.length > 0 && !bad.length, `${own.size} same-origin links and assets return 200`, bad);
    // The same completeness rule for external links: every one the pages hold needs a status.
    const external = new Set(side.external.map(([, u]) => { try { const x = new URL(u); x.hash = ''; return x.href; } catch { return u; } }));
    const missing = [];
    for (const n of htmlPages) {
      for (const u of urlsOf(doc[n], pathOf(n))) if (!isOwn(u) && !external.has(u)) missing.push(`not collected by live.sh: ${u}`);
    }
    const fails = [...new Set(missing), ...side.external.filter(([c]) => /^5/.test(c)).map(([c, u]) => `${c} ${u}`)];
    const warns = side.external.filter(([c]) => !/^[23]/.test(c) && !/^5/.test(c)).map(([c, u]) => `${c} ${u}`);
    report('T6', s, fails.length ? false : warns.length ? 'warn' : true, `${side.external.length} external links, ${fails.length} 5xx or not collected, ${warns.length} other failures`, [...fails, ...warns]);
  }
  // T7: no script element.
  report('T7', s, !scripted(htmlPages).length, 'no <script on any page', scripted(htmlPages));
  // T8: no Set-Cookie, no storage APIs.
  {
    const bad = [];
    for (const n of [...htmlPages, 'robots', 'sitemap']) if (p[n].headers['set-cookie']) bad.push(`${n} Set-Cookie`);
    // Assets too: on build every response the judge fetched, on live every same-origin URL
    // live.sh requested. A snapshot without the asset header record fails.
    const assets = side.assetCookies();
    if (assets === null) bad.push('live.sh kept no asset-cookies.tsv');
    for (const u of assets ?? []) bad.push(`asset ${u} Set-Cookie`);
    for (const n of storage(htmlPages)) bad.push(`${n} storage API`);
    report('T8', s, !bad.length, 'no cookie header and no storage API', bad);
  }
  // T9, the html part (browser.mjs has the browser part on both sides).
  {
    const bad = await foreign(htmlPages);
    report('T9', s, !bad.length, 'no third-party loader, connection hint or foreign CSS (html part)', bad);
  }
  // T11: footer sentence on every page.
  report('T11', s, !footerless(htmlPages).length, 'footer privacy promise on every page', footerless(htmlPages));
  // T12 robots, T13 sitemap.
  {
    const r = p.robots;
    const bad = [];
    if (r.status !== 200) bad.push(`status ${r.status}`);
    if (!/^text\/plain/.test(r.headers['content-type'] ?? '')) bad.push(`content-type ${r.headers['content-type']}`);
    for (const want of ['Allow: /', `Sitemap: ${SITE}/sitemap.xml`]) if (!r.body.includes(want)) bad.push(`missing "${want}"`);
    report('T12', s, !bad.length, 'robots.txt', bad);
  }
  {
    const r = p.sitemap;
    const bad = [];
    if (r.status !== 200) bad.push(`status ${r.status}`);
    // The content type comes from the server. GitHub Pages must send the key's application/xml.
    // astro preview sends text/xml, so the build side accepts either XML type and nothing else.
    const type = r.headers['content-type'] ?? '';
    if (s === 'live' ? !/^application\/xml/.test(type) : !/^(application|text)\/xml/.test(type)) bad.push(`content-type ${type}`);
    const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    const want = key.pages.map((pg) => SITE + pg.path).sort();
    if (JSON.stringify(locs) !== JSON.stringify(want)) bad.push(`locs ${locs.join(' ')}`);
    for (const l of locs) if (isDarkPath(new URL(l, SITE).pathname)) bad.push(`dark URL ${l}`);
    report('T13', s, !bad.length, 'sitemap.xml lists exactly the key pages, no /dark/ URL', bad);
  }
  // T15: the header mark is the key's Mark path, drawn crisp, and og:image:alt names the mark.
  {
    const bad = [];
    for (const n of [...htmlPages, ...darkUp]) {
      const svg = doc[n].querySelector('header svg');
      if (!svg) { bad.push(`${pathOf(n)} no header svg`); continue; }
      if (svg.getAttribute('shape-rendering') !== 'crispEdges') bad.push(`${pathOf(n)} header svg shape-rendering "${svg.getAttribute('shape-rendering') ?? 'none'}"`);
      const paths = svg.querySelectorAll('path');
      if (paths.length !== 1) bad.push(`${pathOf(n)} header svg has ${paths.length} <path> elements, expected 1`);
      else if (paths[0].getAttribute('d') !== key.mark) bad.push(`${pathOf(n)} header svg path d "${(paths[0].getAttribute('d') ?? '').slice(0, 40)}..." is not the Mark path`);
    }
    const alt = doc.home.querySelector('meta[property="og:image:alt"]')?.getAttribute('content') ?? '';
    if (!alt.includes('skull bunny mark')) bad.push(`og:image:alt "${alt}"`);
    report('T15', s, !bad.length, 'the header mark is the key\'s skull bunny path, crispEdges', bad);
  }
  // T16: no owl or Hoolio.
  {
    const bad = owlish(htmlPages);
    if (s === 'build') {
      for (const f of walk(publicDir)) for (const t of ['owl', 'Hoolio']) if (word(t).test(relative(publicDir, f).replace(/[._/-]/g, ' '))) bad.push(`public/${relative(publicDir, f)}`);
    }
    report('T16', s, !bad.length, 'no owl or Hoolio in text, attributes or public file names', bad);
  }
  // T17 to T22: Holiday Sprint 1 facts, now invariants.
  // Only text and links a visitor can see count. browser.mjs repeats T17 and T18 on the rendered page.
  const hasRelease = (el) => el?.querySelectorAll('a[href]').some((a) => a.getAttribute('href') === RELEASE && shown(a, el) && visibleText(a));
  {
    const bad = [];
    if (!visibleText(doc.vivary.querySelector('body')).includes('v0.1.0-beta.1')) bad.push('no visible "v0.1.0-beta.1" text');
    if (!hasRelease(doc.vivary)) bad.push(`no link to ${RELEASE}`);
    report('T17', s, !bad.length, '/vivary/ shows beta.1 and links its release', bad);
  }
  {
    const h = doc.home.querySelector('#feature-vivary');
    let sec = h;
    while (sec && sec.tagName !== 'ARTICLE' && sec.parentNode?.getAttribute?.('id') !== 'work') sec = sec.parentNode;
    const bad = [];
    if (!sec) bad.push('no Vivary section (#feature-vivary) on the home page');
    else {
      if (!shown(sec, doc.home) || !visibleText(sec).includes('v0.1.0-beta.1')) bad.push('no visible "v0.1.0-beta.1" text in the Vivary section');
      if (!hasRelease(sec)) bad.push(`no link to ${RELEASE} in the Vivary section`);
    }
    report('T18', s, !bad.length, 'home Vivary section shows beta.1 and links its release', bad);
  }
  // T19, as the key words it: no "Windows preview came out" and no "In development" anywhere on the
  // two pages, and Sept 22, 2026 not given as the latest release, which is what the status badges
  // and the now line state. A history line that names the date may stay.
  {
    const bad = [];
    for (const n of ['home', 'vivary']) {
      const body = visibleText(doc[n].querySelector('body')).toLowerCase();
      for (const t of ['Windows preview came out', 'In development']) if (body.includes(t.toLowerCase())) bad.push(`${n} has "${t}"`);
      for (const el of doc[n].querySelectorAll('.status, .now')) if (/sept\.? 22,? 2026/i.test(visibleText(el))) bad.push(`${n} states Sept 22, 2026 as current: "${visibleText(el)}"`);
    }
    report('T19', s, !bad.length, 'no preview sentence, no "In development", Sept 22 not the latest release', bad);
  }
  {
    const bad = doc.vivary.querySelectorAll('a[href]').map((a) => a.getAttribute('href')).filter((h) => /npmjs\.com|pypi\.org/i.test(h));
    report('T20', s, !bad.length, '/vivary/ has no npm or PyPI link', bad);
  }
  {
    const about = doc.about.querySelector('main') ?? doc.about;
    const strings = [text(about), ...about.querySelectorAll('[href]').map((a) => a.getAttribute('href'))];
    const bad = [];
    if (strings.some((x) => word('Zo').test(x))) bad.push('whole word "Zo"');
    if (strings.some((x) => /zocomputer/i.test(x))) bad.push('"zocomputer"');
    report('T21', s, !bad.length, '/about/ does not mention Zo', bad);
  }
  // T22: company voice. Naming Jeff in the third person is allowed.
  {
    const main = text(doc.home.querySelector('main')).replace('I. The main project', '');
    const bad = ["I'm", 'I’m', 'I build', 'I have', 'my', 'me']
      .filter((t) => word(t).test(main))
      .map((t) => `"${t}" near: ${main.slice(Math.max(0, main.search(word(t)) - 30), main.search(word(t)) + 40)}`);
    report('T22', s, !bad.length, 'home <main> is in company voice', bad);
  }
  // T23: each page in the Required strings table, and its dark page once it serves, keeps every
  // string in the visible text of <main>.
  {
    const bad = [];
    for (const r of key.required) {
      for (const n of [nameOf(r.path), ...darkUp.filter((d) => LIGHT_OF[d] === r.path)]) {
        const main = visibleText(doc[n].querySelector('main'));
        for (const want of r.strings) if (!main.includes(want)) bad.push(`${pathOf(n)} <main> lacks "${want}"`);
      }
    }
    report('T23', s, !bad.length, `${key.required.length} pages keep their required strings in <main>`, bad);
  }
  // T24: each dark route serves its light page's content under the light pages' rules.
  {
    const bad = [...darkDown];
    for (const n of darkUp) {
      const want = key.pages.find((pg) => pg.path === LIGHT_OF[n]).h1;
      const h1 = text(doc[n].querySelector('h1'));
      if (h1 !== want) bad.push(`${DARK[n]} h1 "${h1}" expected "${want}"`);
      const scheme = doc[n].querySelector('head meta[name="color-scheme"]')?.getAttribute('content');
      if (scheme !== 'dark') bad.push(`${DARK[n]} meta color-scheme "${scheme ?? 'none'}", expected "dark"`);
      const canonical = doc[n].querySelectorAll('head link[rel~="canonical"]').map((l) => l.getAttribute('href'));
      if (!canonical.includes(SITE + LIGHT_OF[n])) bad.push(`${DARK[n]} canonical "${canonical.join(' ')}", expected ${SITE}${LIGHT_OF[n]}`);
    }
    if (darkUp.length) {
      const assets = s === 'build' ? await buildAssets(darkUp) : liveAssets(darkUp);
      bad.push(...assets.bad.map((d) => `T5 ${d}`));
      const cookied = new Set((side.assetCookies() ?? []).map((u) => (isOwn(u) ? u : new URL(u).pathname)));
      for (const u of assets.own) if (cookied.has(u)) bad.push(`T8 asset ${u} Set-Cookie`);
      for (const n of darkUp) if (p[n].headers['set-cookie']) bad.push(`T8 ${DARK[n]} Set-Cookie`);
      bad.push(...scripted(darkUp).map((n) => `T7 ${DARK[n]} has <script`));
      bad.push(...storage(darkUp).map((n) => `T8 ${DARK[n]} storage API`));
      bad.push(...(await foreign(darkUp)).map((d) => `T9 ${d}`));
      bad.push(...footerless(darkUp).map((n) => `T11 ${DARK[n]} lacks the footer promise`));
      bad.push(...owlish(darkUp).map((d) => `T16 ${d}`));
    }
    report('T24', s, !bad.length, `${darkUp.length} of ${darkNames.length} dark routes serve the light page's content`, bad);
  }
  // T25: every light page links its dark route, and every dark page links back, visibly.
  {
    const bad = [...darkDown];
    const variantLink = (n, label, target) => {
      const links = doc[n].querySelectorAll('a[href]').filter((a) => visibleText(a) === label && shown(a, doc[n]));
      const hrefs = links.map((a) => resolveRef(a.getAttribute('href'), SITE + pathOf(n)));
      if (!links.length) bad.push(`${pathOf(n)} has no visible "${label}" link`);
      else if (!hrefs.includes(target)) bad.push(`${pathOf(n)} "${label}" links ${hrefs.join(' ')}, expected ${target}`);
    };
    const darkOf = (light) => key.dark.find((d) => d.light === light).path;
    for (const n of htmlPages) variantLink(n, 'Dark version', darkOf(n === 'notfound' ? '/' : PATHS[n]));
    for (const n of darkUp) variantLink(n, 'Light version', LIGHT_OF[n]);
    report('T25', s, !bad.length, 'a visible "Dark version" and "Light version" link on every page', bad);
  }
  // T26: page links stay in their variant. Only the variant link crosses. Assets do not count.
  {
    const bad = [...darkDown];
    const isPage = (u) => { const last = u.split('?')[0].split('/').pop(); return !last || /\.html?$/.test(last) || !/\.[a-z0-9]+$/i.test(last); };
    const pageLinks = (n) => doc[n].querySelectorAll('a[href]')
      .map((a) => ({ label: visibleText(a), u: resolveRef(a.getAttribute('href'), SITE + pathOf(n)) }))
      .filter(({ u }) => u && isOwn(u) && isPage(u));
    for (const n of htmlPages) for (const { label, u } of pageLinks(n)) {
      if (isDarkPath(u) && label !== 'Dark version') bad.push(`${pathOf(n)} links into the dark variant: ${u} "${label}"`);
    }
    for (const n of darkUp) for (const { label, u } of pageLinks(n)) {
      if (!isDarkPath(u) && label !== 'Light version') bad.push(`${pathOf(n)} leaves the dark variant: ${u} "${label}"`);
    }
    report('T26', s, !bad.length, 'page links stay in their variant except the variant link', bad);
  }
  // T28: no prefers-color-scheme in any HTML or CSS, and no stored preference (T7, T8 rules).
  {
    const bad = [];
    const files = s === 'build'
      ? (existsSync(dist) ? walk(dist) : []).filter((f) => /\.(html|css)$/.test(f))
        .map((f) => ({ where: `dist/${relative(dist, f)}`, html: f.endsWith('.html'), text: readFileSync(f, 'utf8') }))
      : [...[...htmlPages, ...darkUp].map((n) => ({ where: pathOf(n), html: true, text: p[n].body })),
        ...side.sheets.map((c) => ({ ...c, html: false }))];
    if (!files.some((f) => f.html)) bad.push(s === 'build' ? `no HTML under ${dist}` : 'no pages');
    for (const f of files) {
      if (/prefers-color-scheme/i.test(f.text)) bad.push(`${f.where} has prefers-color-scheme`);
      if (f.html && /<script/i.test(f.text)) bad.push(`${f.where} has <script`);
      if (f.html && /document\.cookie|localStorage|sessionStorage|navigator\.sendBeacon/.test(f.text)) bad.push(`${f.where} has a storage API`);
    }
    report('T28', s, !bad.length, `${files.length} HTML and CSS files have no prefers-color-scheme and no stored preference`, bad);
  }
  // T31: the holiday overlay is off. A season stylesheet is one named for a season or keyed off
  // data-season, which is how the approved overlay is built.
  {
    const bad = [];
    for (const n of [...htmlPages, ...darkUp]) {
      const season = doc[n].querySelector('html')?.getAttribute('data-season');
      if (season !== undefined) bad.push(`${pathOf(n)} <html data-season="${season}">`);
      for (const c of await pageCss(n)) if (/season/i.test(c.where) || /data-season/i.test(c.text ?? '')) bad.push(`${pathOf(n)} loads season CSS ${c.where}`);
    }
    if (s === 'build') {
      const dir = join(dirname(publicDir), '.github', 'workflows');
      if (!existsSync(dir)) bad.push(`no workflows folder at ${dir}`);
      else for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
        const yml = readFileSync(join(dir, f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
        if (/^\s*schedule\s*:|[[,]\s*schedule\s*[\],]/m.test(yml)) bad.push(`.github/workflows/${f} has a schedule trigger`);
      }
    }
    report('T31', s, !bad.length, s === 'build' ? 'no season overlay on any page and no scheduled workflow' : 'no season overlay on any page', bad);
  }
  // T32, the html part: each variant's CSS defines its tokens with the key's values.
  // browser.mjs has the pink-text part.
  {
    const bad = [...darkDown];
    const defines = (css, name, value) => new RegExp(`${esc(name)}\\s*:\\s*${esc(value)}\\s*(!important\\s*)?[;}]`, 'i').test(css);
    for (const [names, tokens] of [[lightNames, key.lightTokens], [darkUp, key.darkTokens]]) {
      for (const n of names) {
        const css = await pageCss(n);
        for (const c of css) if (c.text === null) bad.push(`${pathOf(n)} stylesheet ${c.where} unreadable`);
        const all = css.map((c) => c.text ?? '').join('\n');
        for (const [name, value] of Object.entries(tokens)) if (!defines(all, name, value)) bad.push(`${pathOf(n)} CSS does not define ${name}: ${value}`);
      }
    }
    report('T32', s, !bad.length, 'light and dark tokens defined with the key\'s values (html part)', bad);
  }
  // T35: every three-digit number in a nav, the page index or the button bar is a link to a route
  // of the page's own variant, an anchor on the page, or its external site from the key.
  {
    const bad = [];
    const NUM = /(?<![\p{L}\p{N}])\d{3}(?![\p{L}\p{N}])/gu;
    const target = (n, num, href, routes) => {
      if (href.startsWith('#')) return doc[n].querySelector(`[id="${href.slice(1)}"]`) ? null : 'no such anchor on the page';
      const u = resolveRef(href, SITE + pathOf(n));
      if (u && isOwn(u)) return routes.has(u.split('?')[0]) || (u.split('?')[0] === pathOf(n) && href.includes('#')) ? null : 'not a route of this variant';
      const ext = key.externalNumbers.find((e) => e.number === num);
      if (!u || !ext) return 'not a route of this variant and not an external page number';
      const bare = u.replace(/\/$/, '');
      return ext.targets.some((t) => bare === t.replace(/\/$/, '') || bare.startsWith(`${t.replace(/\/$/, '')}/`)) ? null : `expected ${ext.targets.join(' or ')}`;
    };
    for (const n of [...htmlPages, ...darkUp]) {
      const routes = new Set((isDarkPath(pathOf(n)) ? key.dark : key.pages).map((r) => r.path));
      const texts = new Set();
      const collect = (el) => { for (const c of el.childNodes) if (c.nodeType === 3) texts.add(c); else collect(c); };
      for (const el of doc[n].querySelectorAll('nav, .pageindex, .buttonbar')) collect(el);
      let seen = 0;
      for (const t of texts) {
        if (!shown(t.parentNode, doc[n])) continue;
        for (const [num] of t.text.matchAll(NUM)) {
          seen++;
          let a = t.parentNode;
          while (a && !(a.tagName === 'A' && a.getAttribute('href') !== undefined)) a = a.parentNode;
          if (!a) { bad.push(`${pathOf(n)} page number ${num} is not inside a link`); continue; }
          const why = target(n, num, a.getAttribute('href').trim(), routes);
          if (why) bad.push(`${pathOf(n)} page number ${num} links ${a.getAttribute('href')}: ${why}`);
        }
      }
      if (!seen) bad.push(`${pathOf(n)} shows no three-digit page number in a nav, the page index or the button bar`);
    }
    report('T35', s, !bad.length, 'every page number is a link to its variant, an anchor or its external site', bad);
  }
  // T38: house style on every light and dark page.
  {
    const bad = [...darkDown];
    const BANNED = ['unlock', 'empower', 'seamless', 'robust', 'revolutionary', 'game-changing', 'elevate'];
    for (const n of [...lightNames, ...darkUp]) {
      const body = visibleText(doc[n].querySelector('body'));
      const at = body.indexOf(EM_DASH);
      if (at >= 0) bad.push(`${pathOf(n)} em dash near: ${body.slice(Math.max(0, at - 30), at + 30)}`);
      for (const w of BANNED) if (word(w).test(body)) bad.push(`${pathOf(n)} says "${w}"`);
      for (const u of urlsOf(doc[n], pathOf(n))) if (/mascot/i.test(u)) bad.push(`${pathOf(n)} loads a mascot image ${u}`);
      for (const c of await pageCss(n)) {
        if (/big[\s_-]*shoulders/i.test(c.text ?? '')) bad.push(`${pathOf(n)} CSS ${c.where} names Big Shoulders`);
        for (const u of cssUrls(c.text ?? '')) if (/mascot/i.test(u)) bad.push(`${pathOf(n)} CSS ${c.where} loads a mascot image ${u}`);
      }
    }
    report('T38', s, !bad.length, 'no em dash, banned word, mascot image or Big Shoulders', bad);
  }
}

const live = liveSide();
if (!live) {
  console.log('FAIL    LIVE  live snapshot missing: run live.sh on a host that reaches production and pass its folder');
} else if (live.age > MAX_SNAPSHOT_AGE_S || live.age < 0) {
  console.log(`FAIL    LIVE  live snapshot is ${Math.round(live.age / 60)} minutes old, limit ${MAX_SNAPSHOT_AGE_S / 60}`);
}
const liveOk = Boolean(live) && live.age <= MAX_SNAPSHOT_AGE_S && live.age >= 0;
await judge(await buildSide());
if (liveOk) await judge(live);

const count = (side, target) => results.filter((r) => r.side === side && r.target === target && r.verdict === 'FAIL').length;
const summary = {
  liveSnapshot: liveOk,
  invariantsFailed: count('build', false) + count('live', false),
  targetsFailedBuild: count('build', true),
  targetsFailedLive: count('live', true),
};
writeFileSync(join(evidence, 'checks.json'), JSON.stringify({ summary, results }, null, 1));
const pass = liveOk && summary.invariantsFailed === 0;
console.log(`CHECKS_RESULT=${pass ? 'pass' : 'fail'} invariants_failed=${summary.invariantsFailed} targets_failed_build=${summary.targetsFailedBuild} targets_failed_live=${summary.targetsFailedLive}`);
process.exit(pass ? 0 : 1);
