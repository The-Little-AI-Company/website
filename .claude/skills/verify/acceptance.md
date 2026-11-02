# Acceptance table

The answer key for `.claude/skills/verify` in `The-Little-AI-Company/website`.
First written 2026-11-01 by the Ops steward against live production at
`https://littleaicompany.com` and the repo's `README.md` and
`tests/unit/third-party.test.ts` on `dev`, before the skill drove anything.
Revised 2026-11-02 by the Engineer for the light and dark redesign, from these
sources:

- Jeff's approval of the light and dark design on 2026-11-02:
  `Shared/sprints/2026-11-01-riso-teletext-sites/APPROVAL-2026-11-02-TLAC-light-dark.md`,
  bundle SHA-256 `5F2CDBD0EE04EDE4153C5A5BBA8998CDDF7C01FD74A93A97074920DB5EE9E424`.
- The approved prototype in the same folder, `prototype-k/` (`tlac-home.html`,
  `tlac-vivary.html`, `dark/`, `preview-thanksgiving/`).
- The candidate rows in `VERIFY-DESIGN-ROWS.md` in the same folder, and
  `littleaicompany-DESIGN.md`.
- Live production on 2026-11-02, after PR #71. T17 to T22 pass there.

The checks read their expected values from this file or from live production,
never from the build under test. The skill reads this file from `origin/dev`
only. A branch that edits it fails the KEY check, and so does a run where
`origin/dev` has no readable copy. A change to this file lands in its own
reviewed PR before any branch relies on it.

A missing browser, container, network or key is FAIL, never SKIP or PASS. Every
check writes what it saw to the evidence folder.

## Check types

| Type | Meaning |
|---|---|
| http | A request to the page or file, reading the status, headers and body |
| html | A parse of the HTML (built `dist/` and, after deploy, live) |
| browser | Chromium loads the page from `astro preview` and watches the DOM and network |
| links | Every link on every page is requested |
| repo | A repo command or file comparison in the pinned build container |
| parity | A comparison against live production as it was when the run started |

## Status column

- `invariant`: passes on today's production. A failure is a regression.
- `target, fails on today's production`: the light and dark redesign (Jeff,
  2026-11-02). Expected to FAIL against live production and against `dev` until
  the redesign PR lands. The redesign PR must turn each one to PASS on the build.
  A later key PR moves them to invariant after the redesign is live. Do not
  report these as KNOWN.

## Visitor journeys

| ID | User action | Expected result | Check | Status |
|---|---|---|---|---|
| T1 | Open each page in the Pages table | Status 200. The `h1` text matches the Pages table | http | invariant |
| T2 | Open `/does-not-exist/` | Status 404. The 404 page has the site header and footer | http | invariant |
| T3 | Click each main nav link from the home page | The browser lands on the destination in the Pages table and shows its `h1`. A link's label is its text without a leading page number, so "110 Callout" has the label "Callout" | browser | invariant |
| T4 | Click the header mark (the `/` link) on `/about/` | The browser lands on `/` | browser | invariant |
| T5 | Follow every same-origin link and asset on every page (pages, CSS, fonts, icons, images, `og.png`, `site.webmanifest`) | Status 200 from the local server, and from live after deploy | links | invariant |
| T6 | Follow every external link on every page | No 5xx. A network failure or 4xx is listed as a warning, not a failure | links | invariant |
| T7 | Load any page | Zero `<script` elements of any kind, inline or with `src` | html | invariant |
| T8 | Load any page | No `Set-Cookie` response header on the page or on any asset it loads. The built HTML has no `document.cookie`, `localStorage`, `sessionStorage` or `navigator.sendBeacon` | http, html | invariant |
| T9 | Load every page in Chromium and record the network | Every request goes to the page's own origin. No `preconnect`, `dns-prefetch`, `prefetch` or `prerender` link. No CSS `@import` and no `url()` to another host | browser | invariant |
| T10 | Run the repo's third-party test | `tests/unit/third-party.test.ts` is byte-identical to its `origin/dev` copy and passes. A branch that weakens it fails | repo | invariant |
| T11 | Read the footer on every page | It contains the exact sentence in the Footer table | html | invariant |
| T12 | Request `/robots.txt` | Status 200, `text/plain`. Body contains `Allow: /` and `Sitemap: https://littleaicompany.com/sitemap.xml` | http | invariant |
| T13 | Request `/sitemap.xml` | Status 200, `application/xml`. It lists exactly the five page URLs in the Pages table, absolute on `https://littleaicompany.com`. No `/dark/` URL | http | invariant |
| T14 | Run `pnpm verify` in the pinned container (Node 24.22.1, pnpm 10.34.7, Playwright 1.64.1, Chrome for Testing 156.0.8078.47, per README) | Exit 0 | repo | invariant |
| T15 | Look at the header mark on every page | The header mark `<svg>` has `shape-rendering="crispEdges"` and one `<path>` whose `d` is exactly the Mark path below. The home page `og:image:alt` contains "skull bunny mark" | html | target, fails on today's production |
| T16 | Read every page's text, `alt`, `title` and `aria-label`, and every file name under `public/` | No whole word "owl" or "Hoolio", case-insensitive. Hoolio was retired 2026-09-17 | html, repo | invariant |
| T17 | Open `/vivary/` | The page shows `v0.1.0-beta.1` and has a link whose `href` is exactly `https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1` | html | invariant |
| T18 | Read the Vivary section of the home page | It shows `v0.1.0-beta.1` and links exactly `https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1` | html | invariant |
| T19 | Read the home page and `/vivary/` | No "Windows preview came out" sentence, no "Sept 22, 2026" as the latest release, and no "In development" status for Vivary | html | invariant |
| T20 | Read every link on `/vivary/` | No `href` to `npmjs.com` or `pypi.org` | html | invariant |
| T21 | Read `/about/` | No whole word "Zo" and no "zocomputer", case-insensitive | html | invariant |
| T22 | Read the text inside `<main>` on the home page | Company voice, not first person. None of these as whole words, case-insensitive: "I'm" or "I’m", "I build", "I have", "my", "me". The roman numeral heading "I. The main project" is allowed. Naming Jeff in the third person is allowed (the approved home page says "Jeff Kazzee builds them in rural Idaho.") | html | invariant |
| T23 | Read the text inside `<main>` on each page in the Required strings table | Each page contains every string its row lists, after whitespace is collapsed | html | invariant |
| T24 | Open each route in the Dark pages table | Status 200. The `h1` matches its light page in the Pages table. T5, T7, T8, T9, T11 and T16 hold on it as on the light pages. Its `<head>` has `<meta name="color-scheme" content="dark">` and `<link rel="canonical">` to its light page's absolute URL | http, html, browser | target, fails on today's production |
| T25 | On every light page and every dark page, find the variant link | Every light page, the 404 page included, has a visible link with the text "Dark version" to the same page's route in the Dark pages table (the 404 page links to `/dark/`). Every dark page has a visible link with the text "Light version" to its light page | html, browser | target, fails on today's production |
| T26 | Follow every same-origin link to a page from each variant | From a light page, every page link stays out of `/dark/`, except the "Dark version" link. From a dark page, every page link stays under `/dark/`, except the "Light version" link. Asset links (CSS, fonts, images, icons) are outside this row | html | target, fails on today's production |
| T27 | Open `/` and `/vivary/` in Chromium with the OS color setting emulated as dark, then as light | The light page is the default and does not change with the OS setting: `<meta name="color-scheme" content="light">`, and the computed body background is `#F1F0EB` under both emulations | browser | target, fails on today's production |
| T28 | Read every built HTML and CSS file, and every same-origin stylesheet on live | No `prefers-color-scheme` anywhere. No stored preference: no cookie and no storage API (T8), and no client JavaScript (T7) | html | target, fails on today's production |
| T29 | Open each dark page in Chromium with every stylesheet request blocked, then with them allowed, and read the first painted frame | No bright flash: the page's canvas is dark in both runs. A screenshot of the viewport has a mean relative luminance of 0.05 or less | browser | target, fails on today's production |
| T30 | Read every visible text element on every light and dark page in Chromium | WCAG AA contrast against the nearest opaque background: 4.5:1, or 3:1 for text at 24 px and up or 18.66 px bold and up. Text inside an `aria-hidden` element is outside this row | browser | target, fails on today's production |
| T31 | Read every built and live page, and the repo's workflows | The holiday overlay is off: no `<html>` has a `data-season` attribute and no page loads a season stylesheet. No file under `.github/workflows/` has a `schedule:` trigger (none on 2026-11-02). Turning a theme on needs its own reviewed mechanism | html, repo | target, fails on today's production |
| T32 | Read the built CSS | The light tokens in the Light tokens table and the dark tokens in the Dark tokens table are defined with those values. Pink text on paper is only `--pink-text` on light pages | html | target, fails on today's production |
| T33 | Read the computed style of every element on every light and dark page in Chromium | `border-radius` is 0. No `box-shadow` or `text-shadow` has a blur radius above 0. No `filter` or `backdrop-filter` uses `blur()`. No `linear-gradient` or `conic-gradient`. `radial-gradient` appears only on halftone dot surfaces | browser | target, fails on today's production |
| T34 | Load every light and dark page in Chromium | Fonts are only Dela Gothic One, Zen Kaku Gothic New and VT323, each a woff2 file from the site's own origin. Body text computes to Zen Kaku Gothic New. No text set in VT323 computes below 20 px | browser | target, fails on today's production |
| T35 | Read every three-digit page number shown in the header nav, the page index and the button bar on every page, whether or not it is a link | Each one sits inside a link. Its target is a route in the Pages or Dark pages table of the same variant, an anchor on the same page, or one of the external sites in the External page numbers table | html | target, fails on today's production |
| T36 | Load `/`, `/vivary/`, `/dark/` and `/dark/vivary/` in Chromium at widths 360, 390, 860 and 1440 | No horizontal scroll. Every link and button has a box at least 44 px tall | browser | target, fails on today's production |
| T37 | Use the keyboard on every light and dark page | The first Tab stop is a skip link to `#main`, and `#main` exists. Every focused link and button shows a visible outline | browser | target, fails on today's production |
| T38 | Read every light and dark page | No em dash (U+2014) in the visible text. None of these words, whole word and case-insensitive: unlock, empower, seamless, robust, revolutionary, game-changing, elevate. No Vivary mascot image, no Big Shoulders font | html | target, fails on today's production |

## Pages

| Path | `h1` | In nav |
|---|---|---|
| `/` | Tools for the work you keep doing by hand. | yes (the mark link) |
| `/callout/` | Callout | yes, label "Callout" |
| `/vivary/` | Vivary | yes, label "Vivary" |
| `/about/` | About | yes, label "About" |
| `/contact/` | Contact | yes, label "Contact" |

## Dark pages

Static pages of the same content in the dark variant. Reached only through the
"Dark version" link. Not in the sitemap.

| Path | Light page |
|---|---|
| `/dark/` | `/` |
| `/dark/callout/` | `/callout/` |
| `/dark/vivary/` | `/vivary/` |
| `/dark/about/` | `/about/` |
| `/dark/contact/` | `/contact/` |

## Footer

| Field | Expected |
|---|---|
| Privacy promise | This site sets no cookies, loads nothing from third parties, and keeps no analytics. |

## Required strings

Text that each page keeps through the redesign, in `<main>`, on the light page and
its dark page. Replaces the old byte parity with live, which cannot hold once every
page is restyled.

| Page | Strings |
|---|---|
| `/` | Vivary · Callout · Beta · v0.1.0-beta.1 |
| `/callout/` | Callout · Windows |
| `/vivary/` | Vivary · Beta · v0.1.0-beta.1 · Windows |
| `/about/` | The Little AI Company |
| `/contact/` | jeff@littleaicompany.com |

The `·` separates strings. It is not part of any string.

## Mark path

The skull bunny from `littleaicompany-DESIGN.md`, "The mark", as drawn in the
approved prototype:

`M2 0h2v1h-2zM6 0h2v1h-2zM2 1h2v1h-2zM6 1h2v1h-2zM2 2h2v1h-2zM6 2h2v1h-2zM1 3h8v1h-8zM0 4h10v1h-10zM0 5h2v1h-2zM4 5h2v1h-2zM8 5h2v1h-2zM0 6h2v1h-2zM4 6h2v1h-2zM8 6h2v1h-2zM0 7h4v1h-4zM6 7h4v1h-4zM1 8h8v1h-8zM2 9h1v1h-1zM4 9h2v1h-2zM7 9h1v1h-1zM2 10h6v1h-6z`

## Light tokens

| Token | Value |
|---|---|
| `--paper` | `#F1F0EB` |
| `--ink` | `#161616` |
| `--pink` | `#FF48B0` |
| `--pink-text` | `#C0187A` |
| `--yellow` | `#FFE800` |

## Dark tokens

| Token | Value |
|---|---|
| `--paper` | `#141414` |
| `--ink` | `#F1F0EB` |
| `--pink` | `#FF48B0` |
| `--yellow` | `#FFE800` |
| `--on-fill` | `#161616` |

## External page numbers

| Number | Target |
|---|---|
| 300 | `https://llmarcade.fun` or `https://www.llmarcade.fun` |
| 400 | `https://worldfactbook.xyz` |

## Known defects

None found on 2026-11-02. A check reports a match here as KNOWN, not PASS.
Delete a row when its fix lands. Never add a row to make a new failure pass.
Redesign targets (T15, T24 to T38) are not known defects.

| Path | Found on |
|---|---|

## Notes for the builder

- The live palette before the redesign is "Private Press" and switches with the
  OS through `prefers-color-scheme` (`src/layouts/Base.astro` and
  `src/styles/tokens.css` on 2026-11-02). T28 fails there by design.
- Pages Jeff has not seen in the new system (Callout, About, Contact, 404, and
  their dark pages) are restyled in the same system. Screenshots of each go to the
  Reviewer and to the CEO before merge, and the CEO shows Jeff before publication.
- A holiday theme lands later as its own reviewed PR, with its own key change for
  T31 and T15. Do not edit this file in a theme branch.
