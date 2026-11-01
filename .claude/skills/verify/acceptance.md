# Acceptance table

The answer key for `.claude/skills/verify` in `The-Little-AI-Company/website`.
Written 2026-11-01 by the Ops steward against live production at
`https://littleaicompany.com` (GitHub Pages, `Last-Modified` 2026-10-22, `dev`
last commit 2026-10-22) and the repo's `README.md` and
`tests/unit/third-party.test.ts` on `dev`, before the skill drives anything. The
builder did not write it.

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
- `target, fails on today's production`: Holiday Sprint 1 (Jeff, 2026-11-01).
  Expected to FAIL against live production and against `dev` until the facts PR
  lands. The facts PR must turn each one to PASS. Do not report these as KNOWN.

## Visitor journeys

| ID | User action | Expected result | Check | Status |
|---|---|---|---|---|
| T1 | Open each page in the Pages table | Status 200. The `h1` text matches the Pages table | http | invariant |
| T2 | Open `/does-not-exist/` | Status 404. The 404 page has the site header and footer | http | invariant |
| T3 | Click each main nav link from the home page | The browser lands on the destination in the Pages table and shows its `h1` | browser | invariant |
| T4 | Click the header mark (the `/` link) on `/about/` | The browser lands on `/` | browser | invariant |
| T5 | Follow every same-origin link and asset on every page (pages, CSS, fonts, icons, images, `og.png`, `site.webmanifest`) | Status 200 from the local server, and from live after deploy | links | invariant |
| T6 | Follow every external link on every page | No 5xx. A network failure or 4xx is listed as a warning, not a failure. On 2026-11-01 `https://www.npmjs.com/package/@vivary/create` returned 403 to curl (bot block). Every other external link returned 200 | links | invariant |
| T7 | Load any page | Zero `<script` elements of any kind, inline or with `src` | html | invariant |
| T8 | Load any page | No `Set-Cookie` response header. The built HTML has no `document.cookie`, `localStorage`, `sessionStorage` or `navigator.sendBeacon` | http, html | invariant |
| T9 | Load every page in Chromium and record the network | Every request goes to the page's own origin. No `preconnect`, `dns-prefetch`, `prefetch` or `prerender` link. No CSS `@import` and no `url()` to another host | browser | invariant |
| T10 | Run the repo's third-party test | `tests/unit/third-party.test.ts` is byte-identical to its `origin/dev` copy and passes. A branch that weakens it fails | repo | invariant |
| T11 | Read the footer on every page | It contains the exact sentence in the Footer table | html | invariant |
| T12 | Request `/robots.txt` | Status 200, `text/plain`. Body contains `Allow: /` and `Sitemap: https://littleaicompany.com/sitemap.xml` | http | invariant |
| T13 | Request `/sitemap.xml` | Status 200, `application/xml`. It lists exactly the five page URLs in the Pages table, absolute on `https://littleaicompany.com` | http | invariant |
| T14 | Run `pnpm verify` in the pinned container (Node 24.22.1, pnpm 10.34.7, Playwright 1.64.1, Chrome for Testing 156.0.8078.47, per README) | Exit 0 | repo | invariant |
| T15 | Look at the header mark on every page | The mark is the skull bunny: the header `<svg>` is byte-identical to live production's header mark, and the home page `og:image:alt` contains "skull bunny mark" | html, parity | invariant |
| T16 | Read every page's text, `alt`, `title` and `aria-label`, and every file name under `public/` | No whole word "owl" or "Hoolio", case-insensitive. Hoolio was retired 2026-09-17 | html, repo | invariant |
| T17 | Open `/vivary/` | The page shows `v0.1.0-beta.1` and has a link whose `href` is exactly `https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1` (status 200 on 2026-11-01) | html | target, fails on today's production |
| T18 | Read the Vivary section of the home page | It shows `v0.1.0-beta.1` and links exactly `https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1` | html | target, fails on today's production |
| T19 | Read the home page and `/vivary/` | No "Windows preview came out" sentence, no "Sept 22, 2026" as the latest release, and no "In development" status for Vivary | html | target, fails on today's production |
| T20 | Read every link on `/vivary/` | No `href` to `npmjs.com` or `pypi.org`. Today it links `https://www.npmjs.com/package/@vivary/create` and `https://pypi.org/project/create-vivary/` | html | target, fails on today's production |
| T21 | Read `/about/` | No whole word "Zo" and no "zocomputer", case-insensitive. Today it says "Zo Computer live on my own account at" | html | target, fails on today's production |
| T22 | Read the text inside `<main>` on the home page | Company voice, not Jeff in first person. None of these, case-insensitive: "I'm" or "I’m", "I build", "I have", "my", "me", "Jeff Kazzee". The roman numeral heading "I. The main project" is allowed. The footer sits outside `<main>` and keeps "Jeff Kazzee". Today `<main>` has "I’m Jeff Kazzee. I build Callout", "Other things I have made" and "My tools show their work" | html | target, fails on today's production |
| T23 | Any page the branch does not mean to change (for Holiday Sprint 1: `/callout/` and `/contact/`) | The text inside `<main>` matches live production | parity | invariant |

## Pages

| Path | `h1` on 2026-11-01 | In nav |
|---|---|---|
| `/` | Tools for the work you keep doing by hand. | yes (the mark link) |
| `/callout/` | Callout | yes, label "Callout" |
| `/vivary/` | Vivary | yes, label "Vivary" |
| `/about/` | About | yes, label "About" |
| `/contact/` | Contact | yes, label "Contact" |

## Footer

| Field | Expected |
|---|---|
| Privacy promise | This site sets no cookies, loads nothing from third parties, and keeps no analytics. |

## Known defects

None found on 2026-11-01. A check reports a match here as KNOWN, not PASS.
Delete a row when its fix lands. Never add a row to make a new failure pass.
Sprint 1 targets (T17 to T22) are not known defects.

| Path | Found on |
|---|---|

## Notes for the builder

- The holiday theme (Sprint 3) changes the mark (skull bunny in a knit hat or
  lights) and adds CSS to every page. T15 and T23 will need a key update in its
  own PR before that branch can pass. Do not edit this file in the theme branch.
- The live palette is "Private Press" (README, Brand): light `--ink #1a1714`,
  `--accent #7d2633`, dark `--ink #efe8dc`, `--accent #e2a0a6`, read from the
  live CSS on 2026-11-01. It is not the 2026-09-17 ink, bone and safety orange
  set.
