/**
 * An address that leads nowhere shows the 404 page. `astro preview` serves dist/404.html with a 404
 * status for unknown paths, so this checks the real behavior, from paths at several depths, because the
 * page must not depend on its own URL to find its styles.
 */
import { toRgbString } from '../helpers/color';
import { page as pageOf } from '../helpers/dist';
import { BODY_FAMILY, LIGHT_TOKENS, NAV, NOT_FOUND, RETIRED_PAGES, VARIANT_LINK } from '../helpers/spec';
import { expect, open, test } from './support';

const UNKNOWN = ['/does-not-exist/', '/this-page-does-not-exist', '/a/b/c/d', '/callout/nothing-here', '/dark/nothing-here/', '/img.png', '/services-old/?x=1#top'];
const home = pageOf('home');
const contact = pageOf('contact');

test.describe('unknown addresses', () => {
  for (const path of UNKNOWN) {
    test(`${path} shows the 404 page with a 404 status`, async ({ page }) => {
      await open(page, path, 404);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOT_FOUND.h1);
      await expect(page.getByText(NOT_FOUND.lede)).toBeVisible();
      await expect(page).toHaveTitle(NOT_FOUND.title);
    });

    test(`${path} still has its styles, fonts, navigation and footer`, async ({ page, probe }) => {
      await open(page, path, 404);
      expect(await page.evaluate(() => window.kit.firstFamily(getComputedStyle(document.body)))).toBe(BODY_FAMILY);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(toRgbString(LIGHT_TOKENS['--paper']));
      await expect(page.locator('header nav').getByRole('link')).toHaveCount(NAV.length);
      await expect(page.locator('body > footer')).toBeVisible();
      // Only the document itself is allowed to be a 404. Every asset the page needs loads fine.
      const self = page.url().split('#')[0] ?? '';
      expect(probe.badResponses.filter((r) => !r.endsWith(self))).toEqual([]);
      expect(probe.failedRequests).toEqual([]);
      expect(probe.foreignRequests).toEqual([]);
    });
  }

  test(`"${NOT_FOUND.home}" leads home from a deep path`, async ({ page }) => {
    await open(page, '/a/b/c/d', 404);
    await page.getByRole('link', { name: NOT_FOUND.home }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(home.h1);
  });

  test(`"${NOT_FOUND.contact}" in main leads to the contact page from a deep path`, async ({ page }) => {
    await open(page, '/a/b/c/d', 404);
    await page.locator('main').getByRole('link', { name: NOT_FOUND.contact }).click();
    await expect(page).toHaveURL(/\/contact\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(contact.h1);
  });

  test(`"${VARIANT_LINK.light}" leads to the dark home page from a deep path`, async ({ page }) => {
    await open(page, '/a/b/c/d', 404);
    await page.getByRole('link', { name: VARIANT_LINK.light, exact: true }).first().click();
    await expect(page).toHaveURL(/\/dark\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(home.h1);
  });

  test('no nav link is marked as the current page', async ({ page }) => {
    await open(page, '/nothing', 404);
    await expect(page.locator('header [aria-current]')).toHaveCount(0);
  });
});

test.describe('known addresses are not swallowed by the 404 page', () => {
  for (const [path, heading] of [
    ['/', home.h1],
    ['/callout/', 'Callout'],
    ['/callout', 'Callout'],
    ['/about/', 'About'],
    ['/contact', 'Contact'],
    ['/dark/', home.h1],
    ['/dark/vivary', 'Vivary'],
  ] as const) {
    test(`${path} shows ${heading}`, async ({ page }) => {
      await open(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    });
  }
});

test.describe('retired addresses', () => {
  for (const retired of RETIRED_PAGES) {
    test(`/${retired} sends the visitor home`, async ({ page }) => {
      await page.goto(`/${retired}`);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(home.h1);
    });
  }
});
