# Design system

Rows T30, T32 to T38. Targets for the light and dark redesign. They fail on production until
the redesign PR deploys. "Every light and dark page" means the Pages table and the Dark pages
table. The 404 page counts only where a row says every page (T35).

## Sub-features

- Visible text meets WCAG AA contrast (T30).
- The CSS defines the key's Light tokens and Dark tokens, and pink text on paper is only
  `--pink-text` (T32).
- Square corners, no blur, no gradient except halftone dots (T33).
- Only Dela Gothic One, Zen Kaku Gothic New and VT323, each a woff2 file from the site's own
  origin. Body text in Zen Kaku Gothic New. VT323 at 20px and up (T34).
- Every three-digit page number in a nav, the page index or the button bar is a link (T35).
- No sideways scroll and 44 by 44 px targets at 360, 390, 860 and 1440 px (T36).
- A skip link is the first Tab stop, and focus is always visible (T37).
- No em dash, no banned marketing word, no Vivary mascot, no Big Shoulders (T38).

## How to get to it (user POV)

Read and tab through any light or dark page, at a phone width and a desktop width.

## Driving it

- `browser.mjs` visits each light and dark page once and runs T25, T30, T32, T33, T34 and T37
  there. T27, T29 and T36 have their own visits.
- T30 walks every text node a visitor sees: rendered, `checkVisibility` with opacity, a box of
  at least 1px, and outside `aria-hidden="true"` and `<svg>`. The text colour comes from
  `getComputedStyle`. The background is the nearest opaque `background-color` up the tree,
  with translucent layers composited on top, or `Canvas` when none is opaque. An absolutely
  positioned `::after` or `::before` with `inset: 0` counts as its element's background, so
  the highlight block (`.hl` in the prototype) is read as yellow. Large text is 24px and up,
  or 18.66px and up at weight 700.
- T32's html part (`checks.mjs`) collects each page's `<style>` blocks and same-origin
  stylesheets and requires a declaration such as `--paper: #F1F0EB` for every token, light
  tokens on light pages and dark tokens on dark pages. Its browser part fails visible text on
  a light page whose colour is the light `--pink` on the light `--paper`.
- T33 reads the computed style of `html`, `body`, every element in `body`, and their
  `::before` and `::after`. A shadow fails when its third length (the blur) is above 0. A
  `radial-gradient` passes only on a tile of 32px or less in both directions, which is how the
  halftone dots are drawn.
- T34 reads every `@font-face` rule in the page's stylesheets, every font response, the body's
  first `font-family`, the loaded `FontFace` set, and every visible text node set in VT323.
- T35 (`checks.mjs`) reads the text of every `nav`, `.pageindex` and `.buttonbar` on every page.
  Each standalone three-digit number must sit inside an `<a href>` whose target is a route of
  the page's own variant, an `id` on the page, or the number's row in External page numbers.
  A page with no such number fails, so a site without page numbers cannot pass.
- T36 sets each width, then reads `scrollWidth` against `clientWidth`, and the box of every
  visible `a[href]`, `button` and `[role="button"]`. A link is inside running text when its
  nearest block holds text outside every link and button.
- T37 presses Tab once and reads `document.activeElement`. It must be `<a href="#main">`, and
  `#main` must exist. Then it tabs through the page until focus leaves it or returns to an
  element it has seen. Each focused link or button needs an outline style other than `none`,
  a width of at least 1px, and a colour that differs from the colour behind it.
- T38 (`checks.mjs`) reads the visible text of `<body>` for U+2014 and the banned words, every
  URL the page names and every `url()` in its CSS for "mascot", and its CSS for "Big
  Shoulders".

## Gotchas

- T30 does not read `background-image`, images, or text drawn over a sibling. Text on a
  halftone surface is judged against that surface's `background-color`. It ignores partial
  `opacity` on ancestors and `transform`.
- T32's pink-text part and T30 overlap: pink `#FF48B0` on paper `#F1F0EB` is about 2.7:1, so
  T30 fails the same text.
- T33's halftone rule is the tile size, not a class name. A large radial gradient fails.
- T35 finds the page index and button bar by `nav`, `.pageindex` or `.buttonbar`. A redesign
  that renders them in another element must keep one of these hooks.
- T36 counts any letter or digit outside a link in the link's block as running text. The
  strip's "Dark version" link in the prototype sits in such a block.
- T37 checks that the outline colour differs from the ground. It does not measure the
  outline's contrast.
- On the live side the browser rows need the fonts and images that `live.sh` keeps in
  `files/`. A font the replay cannot serve fails T34 as `answered 404, not kept by live.sh?`.
