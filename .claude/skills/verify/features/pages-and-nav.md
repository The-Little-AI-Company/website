# Pages and navigation

Rows T1 to T6 and T23.

## Sub-features

- Five pages, each with the `h1` the key's Pages table names (T1).
- A 404 page with the site header and footer for any unknown path (T2).
- The main nav: Callout, Vivary, About, Contact (T3).
- The header mark, a link home (T4).
- Every same-origin link and asset answers 200 (T5). External links answer without a 5xx (T6).
- Pages a branch does not mean to change keep live production's text (T23, Sprint 1:
  `/callout/` and `/contact/`).

## How to get to it (user POV)

Open `/`. The header holds the mark (left) and the four nav links. Each page is one click
from every other. Mistyped URLs land on the 404 page.

## Driving it with Playwright and fetch

- `browser.mjs` opens `/`, clicks `navigation "Main" > link "<label>"` for each nav row in
  the key, and reads the landing path and `h1`. Screenshot `screens/<side>-T3-<label>.png`.
- On `/about/` it clicks `header a[href="/"]` and expects `/`. Screenshot `screens/<side>-T4-mark.png`.
- Both journeys run on the build preview and on the live replay, so a renamed live nav label
  or a broken live mark link fails.
- `checks.mjs` requests each page and `/does-not-exist/`, then every `href`, `src`, `poster`,
  `srcset` candidate, `og:image`, and `url()` in style attributes, `<style>` blocks and the
  stylesheets. Each reference is resolved against its page or stylesheet first, so a
  relative `review-missing.png` on `/about/` is requested as `/about/review-missing.png`.
- `live.sh` collects the same references the same way for production.

## Gotchas

- The sandbox network blocks many external hosts, so T6 on the build side is mostly
  `network ECONNRESET` warnings. The live side is the real external link check.
- npmjs.com answers 403 to curl (a bot block), which T6 reports as WARN.
- T23 compares `<main>` text with whitespace collapsed. Markup changes that keep the text
  pass, which is the intent.
