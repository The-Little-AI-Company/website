// The page-number map. Every three-digit number the site shows comes from here, so each one links
// to a page that exists. Numbers are permanent: never reuse a retired one.

export type Variant = 'light' | 'dark';

export type PageNumber = '100' | '110' | '120' | '200' | '300' | '400' | '500' | '600';

/** A page of this site, by its light path, or a site of its own, by its full URL. */
type Destination = { path: string } | { url: string };

export const pages: Record<PageNumber, { label: string } & Destination> = {
  '100': { label: 'Home', path: '/' },
  '110': { label: 'Callout', path: '/callout/' },
  '120': { label: 'Vivary', path: '/vivary/' },
  '200': { label: 'How the tools work', path: '/#p200' },
  '300': { label: 'LLM Arcade', url: 'https://llmarcade.fun' },
  '400': { label: 'Factbook', url: 'https://worldfactbook.xyz' },
  '500': { label: 'About', path: '/about/' },
  '600': { label: 'Contact', path: '/contact/' },
};

/** The order of the page index at the foot of every page. */
export const index: readonly PageNumber[] = ['100', '110', '120', '200', '300', '400', '500', '600'];

/** The header nav. The mark is the link home. */
export const nav: readonly PageNumber[] = ['110', '120', '500', '600'];

/** A light path in the given variant. Dark pages live under /dark/ and link only to each other. */
export function within(path: string, variant: Variant): string {
  return variant === 'dark' ? `/dark${path}` : path;
}

/** Where a page number links from a page of the given variant. */
export function href(n: PageNumber, variant: Variant): string {
  const page = pages[n];
  return 'url' in page ? page.url : within(page.path, variant);
}
