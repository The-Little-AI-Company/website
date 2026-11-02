# Pages and navigation

Rows T1 to T6 and T23.

## Sub-features

- Five pages, each with the `h1` the key's Pages table names (T1).
- A 404 page with the site header and footer for any unknown path (T2).
- The main nav: Callout, Vivary, About, Contact (T3).
- The header mark, a link home (T4).
- Every same-origin link and asset answers 200 (T5). External links answer without a 5xx (T6).
- Each page keeps the strings the key's Required strings table lists, in `<main>`, on the
  light page and on its dark page once that serves (T23).

## How to get to it (user POV)

Open `/`. The header holds the mark (left) and the four nav links. Each page is one click
from every other. Mistyped URLs land on the 404 page.

## Driving it with Playwright and fetch

- `browser.mjs` opens `/`, finds the link in the header nav (`header nav`, whatever its
  accessible name) whose text, without a leading three-digit page number, is the label from
  the key ("110 Callout" is "Callout"), clicks it, and reads the landing path and `h1`. The
  `h1` must be visible, as `seen()` defines it below. Screenshot `screens/<side>-T3-<label>.png`.
- On `/about/` it clicks `header a[href="/"]` and expects `/`. Screenshot `screens/<side>-T4-mark.png`.
- Both journeys run on the build preview and on the live replay, so a renamed live nav label
  or a broken live mark link fails.
- `checks.mjs` requests each page and `/does-not-exist/`, then every `href`, `src`, `poster`,
  `srcset` candidate, `og:image`, and `url()` in style attributes, `<style>` blocks and the
  stylesheets. Each reference is resolved against its page or stylesheet first, so a
  relative `review-missing.png` on `/about/` is requested as `/about/review-missing.png`.
- `live.sh` collects the same references for production with grep, after it turns line
  breaks into spaces, plus the icons in the web app manifest. `checks.mjs` parses the live
  pages and the kept manifest, and live T5 fails for any same-origin URL that
  `same-origin.tsv` lacks, so a reference the grep misses fails instead of passing.
  The build side adds the manifest icons to T5 too.
- T5 judges the URLs the light pages and the 404 page name, on both sides. A URL that only a
  dark page names belongs to T24, which runs the same predicate over the dark pages.
- T23 has two producers per side, and both must pass. `checks.mjs` reads the text of `<main>`
  with inline-hidden subtrees skipped and whitespace collapsed. `browser.mjs` reads the
  rendered `<main>` on each light page and each dark page that answers 200, keeping only text
  whose element passes `seen()`: `checkVisibility` with opacity, a box larger than 1px, and
  inside the page area a visitor can scroll to. That catches text a stylesheet hides. An
  element that does not render inline separates words, as in the static reader.

## Gotchas

- The sandbox network blocks many external hosts, so T6 on the build side is mostly
  `network ECONNRESET` warnings. The live side is the real external link check.
- npmjs.com answers 403 to curl (a bot block), which T6 reports as WARN.
- T23 matches each string case-sensitively. A restyle that keeps the words passes. A
  dark page is read only when it answers 200, so T23 stays an invariant while the dark
  routes 404.
- T3 reads the first-level navigation as every `nav` inside a `header`. Production names it
  "Main" and the approved prototype names it "Pages". Both pass. A header with no `nav` fails
  with `/ has no <nav> inside a <header>`.
- `seen()` does not detect `clip-path`, `color: transparent`, text covered by another element,
  or a child of a 1px `overflow: hidden` box. The approved prototype hides no required text
  these ways and has no screen-reader-only class.
- Live T5 covers the resource types the site served on 2026-11-01: the HTML pages, their
  stylesheets and `url()` fonts, the web app manifest and its icons, `srcset` and
  `<picture><source>` images, preloads, robots.txt and sitemap.xml. It does not read CSS
  `@import` without `url()`, `image-set()`, `xlink:href`, `imagesrcset`, or feeds. The site
  uses none of them. A branch that adds one needs a key row and a collector change first.
- `live.sh` decodes only `&amp;` in attribute values. A URL with another character
  reference fails live T5 as not collected, so the gap fails closed.
