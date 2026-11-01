// Browser journeys in the reviewed Chrome, on both sides:
//   build: astro preview of the branch under test
//   live:  replay.mjs serving the live.sh snapshot, production's own pages and stylesheets
// Rows: T3, T4, T9 (every request), and T17, T18 (release text and link visible on the rendered page).
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

  // T3: each main nav link from the home page.
  {
    const bad = [];
    for (const target of navPages) {
      const label = /label "([^"]+)"/.exec(target.nav)[1];
      await page.goto(`${base}/`);
      const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true });
      if (!(await link.count())) { bad.push(`no nav link labelled "${label}"`); continue; }
      await link.click();
      await page.waitForLoadState('load');
      const path = new URL(page.url()).pathname;
      const got = await h1();
      await shot(`T3-${label}`);
      if (path !== target.path) bad.push(`${label} landed on ${path}, expected ${target.path}`);
      if (got !== target.h1) bad.push(`${label} h1 "${got}", expected "${target.h1}"`);
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
  // T9: every page requests only its own origin.
  {
    const bad = [];
    for (const p of [...key.pages.map((x) => x.path), '/does-not-exist/']) {
      requests.length = 0;
      await page.goto(`${base}${p}`, { waitUntil: 'networkidle' });
      await shot(`T9${p.replaceAll('/', '_')}`, true);
      for (const u of requests) if (!own(u)) bad.push(`${p} requested ${u}`);
      if (requests.length === 0) bad.push(`${p} recorded no request at all`);
    }
    report('T9', side, !bad.length, 'every page requests only its own origin (browser part)', bad);
  }
  // T17 and T18: the release text and link are rendered and visible, not only present in the HTML.
  const visibleRelease = (root) => page.evaluate(([sel, release]) => {
    const el = sel ? document.querySelector(sel)?.closest('article, section') : document.body;
    if (!el) return { text: false, link: false, found: false };
    const seen = (n) => n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && n.getBoundingClientRect().width > 0;
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
