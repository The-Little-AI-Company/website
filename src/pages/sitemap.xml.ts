import type { APIRoute } from 'astro';

// Every page of the site that a search engine should list: the pages in this folder, minus the 404 page.
// The redirects from the old site are not pages here, so they are not listed either. The dark pages in dark/
// are not listed: each names its light page as canonical.
const pages = import.meta.glob('./*.astro');
const hidden = new Set(['404']);

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error('A sitemap needs `site` in astro.config.mjs.');
  const urls = Object.keys(pages)
    .map((file) => file.replace(/^\.\/(.*)\.astro$/, '$1'))
    .filter((name) => !hidden.has(name))
    .map((name) => (name === 'index' ? '/' : `/${name}/`))
    .sort()
    .map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
