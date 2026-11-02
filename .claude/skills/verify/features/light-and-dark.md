# Light and dark variants

Rows T24 to T29 and T31. Targets for the light and dark redesign (Jeff, 2026-11-02). They
fail on production until the redesign PR deploys.

## Sub-features

- Each route in the key's Dark pages table answers 200 with its light page's `h1`,
  `<meta name="color-scheme" content="dark">` and a canonical link to the light page's
  absolute URL. T5, T7, T8, T9, T11 and T16 hold on it (T24).
- Every light page, the 404 page included, has a visible "Dark version" link to its dark
  route. Every dark page has a visible "Light version" link back (T25).
- Page links stay in their variant. Only the variant link crosses (T26).
- The light page is the default and ignores the OS colour setting (T27).
- No `prefers-color-scheme` anywhere, and no stored preference (T28).
- A dark page never flashes bright, with or without its stylesheets (T29).
- The holiday overlay is off, and no workflow runs on a schedule (T31).

## How to get to it (user POV)

Open any page and click "Dark version" in the strip. Click "Light version" to come back.

## Driving it

- `live.sh` fetches the five dark routes as `dark-home`, `dark-callout`, `dark-vivary`,
  `dark-about` and `dark-contact`, and records each status. A dark route that is not 200 does
  not fail the collection. `checks.mjs` fails any key route that is missing from
  `pages.tsv`.
- `checks.mjs` judges a dark route only when it answers 200. Otherwise each row that needs
  it gets one detail, such as `/dark/ status 404`. T24 runs the T5, T7, T8, T9, T11 and T16
  predicates over the dark pages and prefixes each detail with that row's ID, so
  `T5 404 /images/missing.png` is a dark-page asset. The light rows keep judging only the
  light pages and the 404 page.
- T24 has browser parts in `browser.mjs`: every dark page answers 200 and requests only its
  own origin, and each dark page that serves shows the footer promise. T25 has a browser
  part: the variant link must pass `seen()` (`checkVisibility` with opacity, a box larger than
  1px, inside the page area a visitor can scroll to) and go to the other variant of the same
  page. A link moved off the page fails.
- T26 reads every same-origin `<a href>` that names a page: a path ending in `/` or `.html`,
  or with no file extension. On a light page, a link under `/dark/` fails unless its visible
  text is "Dark version" and it goes to this page's own dark route, the link T25 requires. On
  a dark page, a link outside `/dark/` fails unless its text is "Light version" and it goes to
  this page's light page.
- T27 opens `/` and `/vivary/` with `emulateMedia({ colorScheme })` set to dark and then light.
  It reads the `color-scheme` meta and the computed body background, which must be the
  key's light `--paper`.
- T28 reads every `.html` and `.css` file under `dist/` on the build side. On the live side it
  reads every page and every stylesheet in `css.txt`. It fails on `prefers-color-scheme`, and
  on any `<script` or storage API in a page.
- T29 opens each dark page twice: once with every stylesheet request aborted, once with them
  allowed. The ground is the computed `background-color` of `<html>`, else of `<body>`, else
  `Canvas` read from a probe element with `background: Canvas`. A translucent ground is
  composited over `Canvas`. Relative luminance must be 0.05 or less.
- T31 fails a page whose `<html>` has `data-season`, or that loads CSS named for a season or
  containing `data-season`. On the build side it also reads `REPO/.github/workflows/*.yml`
  (the parent of `PUBLIC_DIR`) and fails a `schedule` trigger.

## Gotchas

- T31 passes on production on 2026-11-02. Production has no overlay and no scheduled workflow,
  so the key's "fails on today's production" does not hold for this row. It guards the
  redesign and later theme branches.
- T31 recognises a season stylesheet by its name or by `data-season` in its text, which is
  how the approved overlay is built. An overlay keyed off another hook passes unseen.
- T29's blocked run blocks requests of type `stylesheet` only. Inline `<style>` still applies,
  which is the point: the ground must be dark before any stylesheet arrives.
- T27 and T29 read colours through a canvas when Chrome reports a colour that is not `rgb()`,
  such as `oklch()`. A colour outside sRGB is clamped.
- When a dark route is 404, the replay serves production's 404 page there. The browser rows
  report the status and skip the page, so a 404 page is never judged as a dark page.
