# Brand and facts

Rows T15 to T22. T17 to T22 are Holiday Sprint 1 targets. They fail on production until the
facts PR merges and deploys.

## Sub-features

- The header mark is the skull bunny: byte-identical to live production's header `<svg>`,
  and the home `og:image:alt` contains "skull bunny mark" (T15).
- No whole word "owl" or "Hoolio" in page text, `alt`, `title`, `aria-label` or any file
  name under `public/` (T16).
- `/vivary/` and the home Vivary section show `v0.1.0-beta.1` and link
  `https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1` (T17, T18).
- No "Windows preview came out" and no "In development" on `/` or `/vivary/`, and no status
  badge or now line that gives Sept 22, 2026 as the latest release (T19).
- `/vivary/` links neither npmjs.com nor pypi.org (T20).
- `/about/` does not say "Zo" (whole word) or "zocomputer" (T21).
- The home `<main>` text is in company voice (T22).

## How to get to it (user POV)

Read the home page, `/vivary/` and `/about/`.

## Driving it with node-html-parser

- `checks.mjs` reads visible text with whitespace collapsed. It skips subtrees with the
  `hidden` attribute, inline `display:none`, `visibility:hidden` or `opacity:0`, and elements
  that never render. `browser.mjs` repeats T17 and T18 on the rendered page, where a
  stylesheet can hide content too: the element that holds the version text and the release
  link must each pass `checkVisibility` (opacity included) with a non-zero size. Both
  results must pass for the row to pass.
- The home Vivary section is the element around `#feature-vivary` (the Vivary heading), up
  to its `article` or the child of `section#work`. If a branch removes that id, T18 fails
  and says so.
- T22 matches each term as a whole word, case-insensitive, with letters and digits as word
  characters (the Reviewer accepted this reading, 2026-11-01). The heading "I. The main
  project" is removed before matching. The footer is outside `<main>` and keeps "Jeff Kazzee".
- Text for T16, T21 and T22 keeps the word breaks a reader sees: a block element (`p`,
  `div`, `li`, headings and the rest of the list in `checks.mjs`) or `<br>` separates words,
  and an inline element does not. So `<p>Zo</p><p>Company</p>` is two words, and
  `Hoo<span>lio</span>` is one.

## Gotchas

- T15 needs the live snapshot. Sprint 3 (the holiday mark) changes the mark, so T15 needs a
  key PR before that branch can pass.
- T19 reads "as the latest release" as the status badges (`.status`) and the now line
  (`.now`), which are where the site states its current release. A history line elsewhere
  may name Sept 22, 2026.
- The static T17 and T18 check sees inline `style` only. A stylesheet rule that hides the
  version text is caught by the browser check, which requires the element holding the
  text to pass `checkVisibility` (opacity included), be larger than 1px in both directions
  and sit inside the page area a visitor can scroll to. It does not detect `clip-path`, `color: transparent` or text
  covered by another element. The site uses none of these on the release text.
- COVER checks that T17 and T18 have a result on each side, not that both producers ran.
  `checks.mjs` and `browser.mjs` each write one, and COVER passes if one is missing.
  `run-all.sh` always runs both, and `summary.txt` shows both lines.
