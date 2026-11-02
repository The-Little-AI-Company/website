/**
 * Shared pieces of the end-to-end suites: the pages and widths, a probe that records everything the
 * browser does on the network and console, and a kit of color and visibility helpers that runs
 * inside the page, so every suite judges what a visitor sees in the same way.
 */
import { expect, test as base, type Page } from '@playwright/test';
import { PAGES, type PageInfo } from '../helpers/dist';

export { expect, PAGES };
export type { PageInfo };

/** The widths the answer key measures at: two phones, the layout breakpoint, and a desktop. */
export const WIDTHS = [360, 390, 860, 1440] as const;
/** The two widths the expensive checks (axe, keyboard, screenshots) run at. */
export const KEY_WIDTHS = [360, 1440] as const;
export const VIEWPORT_HEIGHT = 900;

// ---------------------------------------------------------------------------
// Probe: what the page did on the console and the network

export interface Probe {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  badResponses: string[];
  /** Requests to any origin other than the preview server. They are aborted, never sent. */
  foreignRequests: string[];
  /** Every font the page fetched, with its status. */
  fonts: { url: string; status: number }[];
}

export const test = base.extend<{ probe: Probe }>({
  probe: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
    const probe: Probe = { consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [], foreignRequests: [], fonts: [] };

    page.on('console', (message) => {
      if (message.type() === 'error') probe.consoleErrors.push(`${message.text()} (${message.location().url})`);
    });
    page.on('pageerror', (error) => probe.pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      if (probe.foreignRequests.includes(request.url())) return; // aborted on purpose
      probe.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) probe.badResponses.push(`${response.status()} ${response.url()}`);
      if (response.request().resourceType() === 'font') probe.fonts.push({ url: response.url(), status: response.status() });
    });
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith(origin) || /^(?:data|blob|about):/.test(url)) await route.continue();
      else {
        probe.foreignRequests.push(url);
        await route.abort();
      }
    });
    await use(probe);
  },
});

// ---------------------------------------------------------------------------
// Opening a page

/**
 * Opens a page, checks the HTTP status (200 unless the caller expects otherwise, so a missing
 * page cannot pass for a page that merely has no problems), waits for fonts, and installs the kit.
 */
export async function open(page: Page, info: PageInfo | string, expectedStatus = 200): Promise<number> {
  const url = typeof info === 'string' ? info : info.url;
  const response = await page.goto(url, { waitUntil: 'load' });
  const status = response?.status() ?? 0;
  expect(status, `HTTP status of ${url}`).toBe(expectedStatus);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.evaluate(`window.kit = (${kit.toString()})()`);
  return status;
}

// ---------------------------------------------------------------------------
// The kit, which runs in the page

export type Rgba = [number, number, number, number];

/** Everything `kit()` returns, as the page sees it after `open()`. */
export type Kit = ReturnType<typeof kit>;

declare global {
  interface Window {
    kit: Kit;
  }
}

/**
 * Color and visibility helpers for code that runs in the page. `open()` installs them as `window.kit`.
 * The function is sent to the page as source, so it must not refer to anything outside itself.
 */
function kit() {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  /** Any CSS color as RGBA, through a canvas so every syntax the browser knows is read the same way. */
  const rgba = (c: string): Rgba => {
    const m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (m) {
      const v = (m[1] ?? '').split(/[\s,/]+/).filter(Boolean).map(parseFloat);
      return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1];
    }
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#000';
    probe.fillStyle = c;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
  };
  const over = (top: Rgba, under: Rgba): Rgba => [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])).concat(1) as Rgba;
  const lum = (c: Rgba): number => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: Rgba, b: Rgba): number => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };
  const hex = (c: Rgba): string => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  /** The system color Canvas, as the page's color-scheme resolves it. */
  const canvasColor = (): Rgba => {
    const d = document.createElement('div');
    d.style.background = 'Canvas';
    document.documentElement.append(d);
    const c = rgba(getComputedStyle(d).backgroundColor);
    d.remove();
    return c;
  };
  /** A ::before or ::after that fills its element, such as the highlight block behind a word. */
  const cover = (el: Element, pseudo: string): Rgba | null => {
    const cs = getComputedStyle(el, pseudo);
    if (cs.content === 'none' || cs.content === 'normal' || cs.position !== 'absolute') return null;
    return ['top', 'right', 'bottom', 'left'].every((k) => cs.getPropertyValue(k) === '0px') ? rgba(cs.backgroundColor) : null;
  };
  /** The color behind an element: the nearest opaque background up the tree, with translucent layers on top. */
  const behind = (el: Element): Rgba => {
    const layers: Rgba[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      for (const bg of [cover(n, '::after'), cover(n, '::before'), rgba(getComputedStyle(n).backgroundColor)]) {
        if (!bg || bg[3] === 0) continue;
        layers.push(bg);
        if (bg[3] >= 1) return layers.reverse().reduce((under, top) => over(top, under));
      }
    }
    return layers.reverse().reduce((under, top) => over(top, under), canvasColor());
  };
  /** Rendered, not transparent, bigger than a screen-reader-only clip, and inside the scrollable page. */
  const seen = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const doc = document.documentElement;
    return (
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
      r.width > 1 &&
      r.height > 1 &&
      r.right + scrollX > 0 &&
      r.bottom + scrollY > 0 &&
      r.left + scrollX < doc.scrollWidth &&
      r.top + scrollY < doc.scrollHeight
    );
  };
  /** Text nodes that draw a box, outside svg, each with its element. */
  const texts = (withAriaHidden: boolean): { text: string; el: Element }[] => {
    const out: { text: string; el: Element }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      const data = t.textContent ?? '';
      if (!data.trim() || !el || el.closest('svg') || (!withAriaHidden && el.closest('[aria-hidden="true"]'))) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      const box = range.getBoundingClientRect();
      if (box.width >= 1 && box.height >= 1) out.push({ text: data.replace(/\s+/g, ' ').trim().slice(0, 40), el });
    }
    return out;
  };
  const firstFamily = (cs: CSSStyleDeclaration): string => (cs.fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
  /** A short name for an element in a failure message. */
  const where = (el: Element, pseudo = ''): string =>
    `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}${pseudo} "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  return { rgba, over, lum, ratio, hex, canvasColor, behind, seen, texts, firstFamily, where };
}

// ---------------------------------------------------------------------------
// Keyboard

/** What a test needs to know about the element that has focus. */
export interface Focused {
  tag: string;
  href: string | null;
  text: string;
  focusVisible: boolean;
  /** Drawn and inside the page. */
  seen: boolean;
  inView: boolean;
  outline: string;
  /** The outline is drawn and its color stands out from what is behind the element. */
  outlined: boolean;
}

/** The element that has focus now, or null when focus is back on the body. */
export async function focused(page: Page): Promise<Focused | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const { kit } = window;
    const cs = getComputedStyle(el);
    const ground = kit.behind(el.parentElement ?? el);
    const color = kit.over(kit.rgba(cs.outlineColor), ground);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      href: el.getAttribute('href'),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      focusVisible: el.matches(':focus-visible'),
      seen: kit.seen(el),
      inView: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${kit.hex(color)} on ${kit.hex(ground)}`,
      outlined: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 && kit.rgba(cs.outlineColor)[3] > 0 && kit.ratio(color, ground) > 1.01,
    };
  });
}

/** The links and buttons a keyboard reaches by Tab, in DOM order, as `tag|href|text`. */
export async function tabStops(page: Page): Promise<string[]> {
  return page.locator('a[href], button, input, select, textarea, summary, [tabindex]').evaluateAll((els) =>
    els
      .filter((el) => !el.matches('[tabindex^="-"], [disabled]') && el.checkVisibility({ checkVisibilityCSS: true }))
      .map((el) => `${el.tagName.toLowerCase()}|${el.getAttribute('href') ?? ''}|${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`),
  );
}

export const signature = (f: Focused): string => `${f.tag}|${f.href ?? ''}|${f.text}`;

/** Readable text for an axe violation list. */
export function formatViolations(
  violations: { id: string; impact?: string | null; help: string; helpUrl: string; nodes: { target: unknown[]; html: string; failureSummary?: string }[] }[],
): string {
  if (violations.length === 0) return 'no violations';
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 6)
        .map((n) => `    - ${n.target.join(' ')}\n      ${n.html.replace(/\s+/g, ' ').slice(0, 160)}\n      ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 300)}`)
        .join('\n');
      return `[${v.impact ?? 'n/a'}] ${v.id}: ${v.help}\n  ${v.helpUrl}\n${nodes}${v.nodes.length > 6 ? `\n    ... and ${v.nodes.length - 6} more` : ''}`;
    })
    .join('\n\n');
}
