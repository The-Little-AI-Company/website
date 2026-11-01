// Judges every http, html, links and parity row of the key, on two sides:
//   build: the branch under test, served by astro preview from its own dist/
//   live:  a production snapshot that live.sh collected
// Usage: node checks.mjs KEY_JSON BUILD_URL DIST_DIR PUBLIC_DIR LIVE_DIR WORK_DIR EVIDENCE_DIR
// Expected values come from the key or from the live snapshot, never from the build.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

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

// Whole word, case-insensitive, letters and digits only count as word characters.
const word = (term) => new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
const text = (el) => (el ? el.text.replace(/\s+/g, ' ').trim() : '');

// ---------- the two sides as one shape ----------
const PATHS = { home: '/', callout: '/callout/', vivary: '/vivary/', about: '/about/', contact: '/contact/' };

async function buildSide() {
  const get = async (path) => {
    const res = await fetch(buildUrl + path, { redirect: 'manual' });
    return { status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
  };
  const pages = {};
  for (const [name, path] of Object.entries(PATHS)) pages[name] = await get(path);
  pages.notfound = await get('/does-not-exist/');
  pages.robots = await get('/robots.txt');
  pages.sitemap = await get('/sitemap.xml');
  return { name: 'build', pages, get };
}

function liveSide() {
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
  return { name: 'live', pages, age, sameOrigin: tsv('same-origin.tsv'), external: tsv('external.tsv'), css: readFileSync(join(liveDir, 'css.txt'), 'utf8') };
}

// URLs a page loads or links, as written in the HTML.
function urlsOf(doc) {
  const out = new Set();
  for (const el of doc.querySelectorAll('[href],[src],[srcset],meta[content]')) {
    for (const a of ['href', 'src', 'content']) {
      const v = el.getAttribute(a);
      if (v && (/^https?:\/\//.test(v) || v.startsWith('/'))) out.add(v);
    }
    const s = el.getAttribute('srcset');
    if (s) for (const part of s.split(',')) out.add(part.trim().split(/\s+/)[0]);
  }
  return [...out];
}
const isOwn = (u) => u.startsWith('/') && !u.startsWith('//') || u === SITE || u.startsWith(`${SITE}/`);

// ---------- rows ----------
async function judge(side) {
  const p = side.pages;
  const doc = Object.fromEntries(Object.entries(p).map(([n, v]) => [n, parse(v.body, { comment: false })]));
  const s = side.name;

  // T1: every page 200, h1 matches the key's Pages table.
  {
    const bad = [];
    for (const pg of key.pages) {
      const name = Object.keys(PATHS).find((n) => PATHS[n] === pg.path);
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
    const own = new Set();
    const ext = new Set();
    const css = [];
    for (const n of [...Object.keys(PATHS), 'notfound']) {
      for (const u of urlsOf(doc[n])) (isOwn(u) ? own : ext).add(u.startsWith(SITE) ? u.slice(SITE.length) || '/' : u);
    }
    for (const u of [...own]) if (u.endsWith('.css')) css.push([u, (await side.get(u)).body]);
    for (const [u, body] of css) for (const m of body.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) {
      if (!m[1].startsWith('data:')) own.add(new URL(m[1], `http://x${u}`).pathname);
    }
    const bad = [];
    for (const u of own) { const r = await side.get(u.split('#')[0]); if (r.status !== 200) bad.push(`${r.status} ${u}`); }
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
    const bad = side.sameOrigin.filter(([c]) => c !== '200').map(([c, u]) => `${c} ${u}`);
    report('T5', s, side.sameOrigin.length > 0 && !bad.length, `${side.sameOrigin.length} same-origin links and assets return 200`, bad);
    const fails = side.external.filter(([c]) => /^5/.test(c)).map(([c, u]) => `${c} ${u}`);
    const warns = side.external.filter(([c]) => !/^[23]/.test(c) && !/^5/.test(c)).map(([c, u]) => `${c} ${u}`);
    report('T6', s, fails.length ? false : warns.length ? 'warn' : true, `${side.external.length} external links, ${fails.length} 5xx, ${warns.length} other failures`, [...fails, ...warns]);
  }
  const htmlPages = [...Object.keys(PATHS), 'notfound'];
  // T7: no script element.
  report('T7', s, !htmlPages.some((n) => /<script/i.test(p[n].body)), 'no <script on any page',
    htmlPages.filter((n) => /<script/i.test(p[n].body)));
  // T8: no Set-Cookie, no storage APIs.
  {
    const bad = [];
    for (const n of [...htmlPages, 'robots', 'sitemap']) if (p[n].headers['set-cookie']) bad.push(`${n} Set-Cookie`);
    for (const n of htmlPages) if (/document\.cookie|localStorage|sessionStorage|navigator\.sendBeacon/.test(p[n].body)) bad.push(`${n} storage API`);
    report('T8', s, !bad.length, 'no cookie header and no storage API', bad);
  }
  // T9, the html part (browser.mjs has the browser part): no hints, no foreign CSS.
  {
    const bad = [];
    for (const n of htmlPages) for (const l of doc[n].querySelectorAll('link[rel]')) {
      if (/\b(preconnect|dns-prefetch|prefetch|prerender)\b/.test(l.getAttribute('rel'))) bad.push(`${n} ${l.toString()}`);
    }
    const cssText = s === 'live' ? side.css : (await Promise.all(urlsOf(doc.home).filter((u) => u.endsWith('.css')).map(async (u) => (await side.get(u)).body))).join('\n');
    if (/@import/i.test(cssText)) bad.push('CSS @import');
    for (const m of cssText.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) if (/^(https?:)?\/\//.test(m[1]) && !m[1].startsWith(SITE)) bad.push(`CSS url ${m[1]}`);
    report('T9', s, !bad.length, 'no connection hints and no foreign CSS (html part)', bad);
  }
  // T11: footer sentence on every page.
  {
    const bad = htmlPages.filter((n) => !text(doc[n].querySelector('footer')).includes(key.footer));
    report('T11', s, !bad.length, 'footer privacy promise on every page', bad);
  }
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
    // The content type comes from the server, not the build. astro preview sends text/xml and
    // GitHub Pages sends application/xml, so only the live side can check the key's type.
    if (s === 'live' && !/^application\/xml/.test(r.headers['content-type'] ?? '')) bad.push(`content-type ${r.headers['content-type']}`);
    const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    const want = key.pages.map((pg) => SITE + pg.path).sort();
    if (JSON.stringify(locs) !== JSON.stringify(want)) bad.push(`locs ${locs.join(' ')}`);
    report('T13', s, !bad.length, 'sitemap.xml lists exactly the key pages', bad);
  }
  // T15: header mark equals live production's, og:image:alt names the mark.
  {
    const bad = [];
    const mark = (d) => d.querySelector('header svg')?.toString() ?? '';
    const reference = mark(parse(live?.pages.home.body ?? '', { comment: false }));
    if (!reference) bad.push('no live reference mark (live snapshot missing)');
    for (const n of htmlPages) if (mark(doc[n]) !== reference) bad.push(`${n} header svg differs from live`);
    const alt = doc.home.querySelector('meta[property="og:image:alt"]')?.getAttribute('content') ?? '';
    if (!alt.includes('skull bunny mark')) bad.push(`og:image:alt "${alt}"`);
    report('T15', s, !bad.length, 'the mark is the skull bunny', bad);
  }
  // T16: no owl or Hoolio.
  {
    const bad = [];
    for (const n of htmlPages) {
      const strings = [text(doc[n].querySelector('body'))];
      for (const el of doc[n].querySelectorAll('[alt],[title],[aria-label]')) for (const a of ['alt', 'title', 'aria-label']) strings.push(el.getAttribute(a) ?? '');
      strings.push(text(doc[n].querySelector('title')));
      for (const t of ['owl', 'Hoolio']) if (strings.some((x) => word(t).test(x))) bad.push(`${n} has "${t}"`);
    }
    if (s === 'build') {
      const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
      for (const f of walk(publicDir)) for (const t of ['owl', 'Hoolio']) if (word(t).test(relative(publicDir, f).replace(/[._/-]/g, ' '))) bad.push(`public/${relative(publicDir, f)}`);
    }
    report('T16', s, !bad.length, 'no owl or Hoolio in text, attributes or public file names', bad);
  }
  // T17 to T22: Holiday Sprint 1 targets.
  const hasRelease = (el) => el?.querySelectorAll('a[href]').some((a) => a.getAttribute('href') === RELEASE);
  {
    const bad = [];
    if (!text(doc.vivary.querySelector('body')).includes('v0.1.0-beta.1')) bad.push('no "v0.1.0-beta.1" text');
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
      if (!text(sec).includes('v0.1.0-beta.1')) bad.push('no "v0.1.0-beta.1" text in the Vivary section');
      if (!hasRelease(sec)) bad.push(`no link to ${RELEASE} in the Vivary section`);
    }
    report('T18', s, !bad.length, 'home Vivary section shows beta.1 and links its release', bad);
  }
  {
    const bad = [];
    for (const n of ['home', 'vivary']) for (const t of ['Windows preview came out', 'Sept 22, 2026', 'In development']) {
      if (text(doc[n].querySelector('body')).toLowerCase().includes(t.toLowerCase())) bad.push(`${n} has "${t}"`);
    }
    report('T19', s, !bad.length, 'no stale preview date or "In development"', bad);
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
  {
    const main = text(doc.home.querySelector('main')).replace('I. The main project', '');
    const bad = ["I'm", 'I’m', 'I build', 'I have', 'my', 'me', 'Jeff Kazzee']
      .filter((t) => word(t).test(main))
      .map((t) => `"${t}" near: ${main.slice(Math.max(0, main.search(word(t)) - 30), main.search(word(t)) + 40)}`);
    report('T22', s, !bad.length, 'home <main> is in company voice', bad);
  }
  // T23: pages Sprint 1 leaves alone keep live production's text. Build side only.
  if (s === 'build') {
    const bad = [];
    for (const n of ['callout', 'contact']) {
      const want = text(parse(live?.pages[n]?.body ?? '', { comment: false }).querySelector('main'));
      const got = text(doc[n].querySelector('main'));
      if (!want) bad.push(`${n} no live reference`);
      else if (got !== want) bad.push(`${n} <main> text differs from live`);
    }
    report('T23', s, !bad.length, '/callout/ and /contact/ text matches live production', bad);
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
