# Privacy promise

Rows T7 to T11. The footer promises: "This site sets no cookies, loads nothing from third
parties, and keeps no analytics."

## Sub-features

- No `<script` element of any kind on any page (T7).
- No `Set-Cookie` header, and no `document.cookie`, `localStorage`, `sessionStorage` or
  `navigator.sendBeacon` in the HTML (T8).
- Every request a page makes in Chrome goes to its own origin. No connection hints. No CSS
  `@import` or `url()` to another host (T9).
- `tests/unit/third-party.test.ts` is byte-identical to `origin/dev` and passes inside T14 (T10).
- The footer sentence is on every page (T11).

## How to get to it (user POV)

Load any page. Nothing outside littleaicompany.com is contacted, and the footer says so.

## Driving it with Playwright and fetch

- `browser.mjs` records every request while it loads each page with `waitUntil: networkidle`,
  and fails on any URL outside the page's own origin. It does this on the build preview and
  on the live replay. A page that records no request at all also fails, so a broken
  recorder cannot pass.
- `checks.mjs` reads response headers and HTML on both sides for T7, T8, T9 and T11. Its T9
  part fails any resource from another origin in the loaders `tests/unit/third-party.test.ts`
  lists, in `srcset`, in style attributes, in `<style>` blocks and in the stylesheets. Plain
  anchors are links a visitor clicks, not loads, so they belong to T6.
- T8 reads the `Set-Cookie` header of every response, not only the pages: on the build side
  every URL `checks.mjs` fetches, on the live side every same-origin URL `live.sh` requests
  (it lists them in `asset-cookies.tsv`). A snapshot without that file fails T8.
- T11 has two producers per side, and both must pass. `checks.mjs` reads the first `<footer>`
  in the HTML. `browser.mjs` reads the same footer as rendered, keeping only text that passes
  `seen()` (`checkVisibility` with opacity, larger than 1px, inside the page), so a stylesheet
  that hides the promise fails. On dark pages the same check is part of T24.
- `run-all.sh` compares the third-party test file with `origin/dev` and requires its name in
  the vitest output of a passing T14.

## Gotchas

- The live replay serves production's pages, and every same-origin asset that `live.sh` saw
  answer 200 (stylesheets, fonts, images, icons). Anything else answers 404 there. T9 reads
  which origins Chrome asked for, not whether they answered, and T5 checks production's
  statuses from the snapshot.
- T7 to T11 judge the light pages and the 404 page. T24 runs the same predicates over the dark
  pages. T8 is the exception: a `Set-Cookie` on any response either side fetched fails T8,
  dark pages included, because a cookie anywhere breaks the footer promise.
- Never edit `tests/unit/third-party.test.ts` to make a branch pass. T10 fails on any byte.
