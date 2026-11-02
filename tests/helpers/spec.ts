/**
 * The copy, numbers and colors the tests expect, written out once. The values come from the verify
 * answer key (.claude/skills/verify/acceptance.md) and the approved design. They are written apart
 * from src/data on purpose: a wrong edit to the source cannot also change what the tests expect.
 *
 * Copy is compared exactly, so the curly quotes and apostrophes the site is typed with are written here too.
 */

export type Variant = 'light' | 'dark';

/** The five pages, in the order of the key's Pages table. `n` is the page number the site shows. */
export const PAGE_TABLE = [
  { id: 'home', path: '/', n: '100', label: 'Home', title: 'The Little AI Company', h1: 'Tools for the work you keep doing by hand.' },
  { id: 'callout', path: '/callout/', n: '110', label: 'Callout', title: 'Callout. The Little AI Company', h1: 'Callout' },
  { id: 'vivary', path: '/vivary/', n: '120', label: 'Vivary', title: 'Vivary. The Little AI Company', h1: 'Vivary' },
  { id: 'about', path: '/about/', n: '500', label: 'About', title: 'About. The Little AI Company', h1: 'About' },
  { id: 'contact', path: '/contact/', n: '600', label: 'Contact', title: 'Contact. The Little AI Company', h1: 'Contact' },
] as const;

export type LightId = (typeof PAGE_TABLE)[number]['id'];

/** The header nav, in order. The mark is the link home and sits outside it. */
export const NAV = PAGE_TABLE.filter((p) => p.id !== 'home').map(({ n, label, path }) => ({ n, label, path }));

/** The page-not-found page. It is light only, and its variant link goes to the dark home page. */
export const NOT_FOUND = {
  title: 'Page not found. The Little AI Company',
  h1: 'Page not found',
  lede: 'That address doesn’t lead anywhere on this site.',
  home: 'Go to the home page',
  contact: 'Contact',
} as const;

/** Text each page keeps in `<main>`, light and dark alike. */
export const REQUIRED_STRINGS: Record<LightId, readonly string[]> = {
  home: ['Vivary', 'Callout', 'Beta', 'v0.1.0-beta.1'],
  callout: ['Callout', 'Windows'],
  vivary: ['Vivary', 'Beta', 'v0.1.0-beta.1', 'Windows'],
  about: ['The Little AI Company'],
  contact: ['jeff@littleaicompany.com'],
};

export const FOOTER_PROMISE = 'This site sets no cookies, loads nothing from third parties, and keeps no analytics.';

export const SKIP_LINK = { label: 'Skip to content', href: '#main' } as const;

/** The one link that crosses from a page to the same page in the other variant. */
export const VARIANT_LINK: Record<Variant, string> = { light: 'Dark version', dark: 'Light version' };

/** The skull bunny on its 10 by 11 pixel grid, exactly as the key pins it. */
export const MARK_PATH =
  'M2 0h2v1h-2zM6 0h2v1h-2zM2 1h2v1h-2zM6 1h2v1h-2zM2 2h2v1h-2zM6 2h2v1h-2zM1 3h8v1h-8zM0 4h10v1h-10zM0 5h2v1h-2zM4 5h2v1h-2zM8 5h2v1h-2zM0 6h2v1h-2zM4 6h2v1h-2zM8 6h2v1h-2zM0 7h4v1h-4zM6 7h4v1h-4zM1 8h8v1h-8zM2 9h1v1h-1zM4 9h2v1h-2zM7 9h1v1h-1zM2 10h6v1h-6z';

export const LIGHT_TOKENS = {
  '--paper': '#F1F0EB',
  '--ink': '#161616',
  '--pink': '#FF48B0',
  '--pink-text': '#C0187A',
  '--yellow': '#FFE800',
} as const;

export const DARK_TOKENS = {
  '--paper': '#141414',
  '--ink': '#F1F0EB',
  '--pink': '#FF48B0',
  '--yellow': '#FFE800',
  '--on-fill': '#161616',
} as const;

/** The only three font families, and the one body text is set in. */
export const FONT_FAMILIES = ['Dela Gothic One', 'Zen Kaku Gothic New', 'VT323'] as const;
export const BODY_FAMILY = 'Zen Kaku Gothic New';
/** VT323 is a pixel face. Below this size it stops being legible. */
export const VT323_MIN_PX = 20;

/** Page numbers that lead to a site of their own, and the addresses each may link to. */
export const EXTERNAL_NUMBERS: Record<string, readonly string[]> = {
  '300': ['https://llmarcade.fun', 'https://www.llmarcade.fun'],
  '400': ['https://worldfactbook.xyz'],
};

export const VIVARY_RELEASE = {
  tag: 'v0.1.0-beta.1',
  href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1',
  date: 'Nov 1, 2026',
} as const;

export const TOOLS_EXPECTED = {
  callout: {
    summary:
      'Press a hotkey over anything you are reading. A small popover tells you whether the text is trying to manipulate you, and whether its claims hold up against sources it fetched.',
    repo: 'https://github.com/The-Little-AI-Company/callout',
    primary: { label: 'Download for Windows', href: 'https://github.com/The-Little-AI-Company/callout/releases/latest/download/Callout-Setup.exe' },
  },
  vivary: {
    status: 'Beta',
    primary: { label: 'Download 0.1.0-beta.1', href: VIVARY_RELEASE.href },
    prerelease: VIVARY_RELEASE,
    repo: 'https://github.com/vivary-dev/vivary',
    queue: 'https://github.com/vivary-dev/vivary/milestone/1',
  },
} as const;

export const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

/** Words the copy never uses, whole word and any case. */
export const BANNED_WORDS = ['unlock', 'empower', 'seamless', 'robust', 'revolutionary', 'game-changing', 'elevate'] as const;

/** First person words the home page never uses, since it speaks for the company. */
export const FIRST_PERSON = ['I’m', "I'm", 'I build', 'I have', 'my', 'me'] as const;

/** Retired 2026-09-17. Never named again, in text, attributes or file names. */
export const RETIRED_NAMES = ['owl', 'Hoolio'] as const;

// ---------------------------------------------------------------------------
// Redirects from the old site (astro.config.mjs)

export const RETIRED_PAGES = ['services', 'club', 'start-here', 'projects', 'brand', 'pages'] as const;
export const GUIDE_REDIRECT_TARGET = 'https://github.com/Jeff-Kazzee';
export const GUIDE_PAGES = [
  'guides',
  'guides/first-useful-thing',
  'guides/is-ai-wrong',
  'guides/prompt-anatomy',
  'guides/use-case-menu',
  'guides/make-it-better',
  'guides/what-not-to-paste',
  'guides/ai-good-and-bad',
] as const;
