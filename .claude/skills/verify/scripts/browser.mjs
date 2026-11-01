// Browser journeys T3, T4 and T9 in the reviewed Chrome, against astro preview.
// Usage: node browser.mjs KEY_JSON BUILD_URL WORK_DIR EVIDENCE_DIR
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [keyFile, buildUrl, work, evidence] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const { chromium } = createRequire(join(work, 'package.json'))('@playwright/test');
const CHROME = '/opt/google/chrome/chrome';
const origin = new URL(buildUrl).origin;
const results = [];
const screens = join(evidence, 'screens');
mkdirSync(screens, { recursive: true });

function report(id, ok, name, details = []) {
  if (!key.rows.some((r) => r.id === id)) throw new Error(`check ${id} has no row in the key`);
  const verdict = ok ? 'PASS' : 'FAIL';
  results.push({ id, side: 'build', verdict, name, details });
  console.log(`${verdict.padEnd(7)} ${id.padEnd(4)} build ${name}`);
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
const page = await browser.newPage();
const requests = [];
page.on('request', (r) => requests.push(r.url()));
const h1 = async () => (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ').trim();
const navPages = key.pages.filter((p) => p.nav.startsWith('yes, label'));

// T3: each main nav link from the home page.
{
  const bad = [];
  for (const target of navPages) {
    const label = /label "([^"]+)"/.exec(target.nav)[1];
    await page.goto(`${buildUrl}/`);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
    await page.waitForLoadState('load');
    const path = new URL(page.url()).pathname;
    const got = await h1();
    await page.screenshot({ path: join(screens, `T3-${label}.png`) });
    if (path !== target.path) bad.push(`${label} landed on ${path}, expected ${target.path}`);
    if (got !== target.h1) bad.push(`${label} h1 "${got}", expected "${target.h1}"`);
  }
  report('T3', bad.length === 0 && navPages.length > 0, `${navPages.length} nav links land on their page`, bad);
}
// T4: the header mark on /about/ goes home.
{
  const bad = [];
  await page.goto(`${buildUrl}/about/`);
  await page.locator('header a[href="/"]').first().click();
  await page.waitForLoadState('load');
  const path = new URL(page.url()).pathname;
  const homeH1 = key.pages.find((p) => p.path === '/').h1;
  if (path !== '/') bad.push(`landed on ${path}`);
  if ((await h1()) !== homeH1) bad.push(`h1 "${await h1()}"`);
  await page.screenshot({ path: join(screens, 'T4-mark.png') });
  report('T4', !bad.length, 'the header mark on /about/ goes to /', bad);
}
// T9: every page requests only its own origin.
{
  const bad = [];
  for (const p of [...key.pages.map((x) => x.path), '/does-not-exist/']) {
    requests.length = 0;
    await page.goto(`${buildUrl}${p}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(screens, `T9${p.replaceAll('/', '_')}.png`), fullPage: true });
    for (const u of requests) if (!u.startsWith(origin) && !u.startsWith('data:')) bad.push(`${p} requested ${u}`);
    if (requests.length === 0) bad.push(`${p} recorded no request at all`);
  }
  report('T9', !bad.length, 'every page requests only its own origin (browser part)', bad);
}
await browser.close();
writeFileSync(join(evidence, 'browser.json'), JSON.stringify({ chrome: version, results }, null, 1));
const failed = results.filter((r) => r.verdict === 'FAIL').length;
console.log(`BROWSER_RESULT=${failed ? 'fail' : 'pass'} failed=${failed} chrome ${version} screenshots ${screens}`);
process.exit(failed ? 1 : 0);
