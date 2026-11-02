# littleaicompany.com verification map

The visitor-facing features of the site, and which key rows prove each one. Read this
index, then the feature file. The rows themselves live in `../acceptance.md`.

## Baseline preconditions

- A build sandbox set up as in `../SKILL.md`, Launch, with the branch under test at
  `/srv/website`.
- A live snapshot from `scripts/live.sh`, less than 6 hours old.
- `run-all.sh` has built `dist` in this sandbox, and `doctor.sh` passes.

## Driving conventions

- Find the nav by its accessible name, `navigation "Main"`, and links by their label. A
  label is the link text without a leading three-digit page number.
- Read text from what a visitor sees: element text, `alt`, `title`, `aria-label`.
- Judge both sides, build and live. A row that fails on live but passes on build is a
  change waiting for its deploy, or a production regression the branch does not fix.

## Features

| File | Feature | Rows |
|---|---|---|
| [pages-and-nav.md](pages-and-nav.md) | Five pages, the 404 page, the nav, the header mark, links, required text | T1 to T6, T23 |
| [privacy.md](privacy.md) | No script, cookie or third-party request, and the footer promise | T7 to T11 |
| [crawlers-and-build.md](crawlers-and-build.md) | robots.txt, sitemap.xml, `pnpm verify` | T12 to T14 |
| [brand-and-facts.md](brand-and-facts.md) | The skull bunny mark, no owl, Vivary beta.1, About, company voice | T15 to T22 |
| [light-and-dark.md](light-and-dark.md) | The `/dark/` pages, the variant links, light by default, no flash, overlay off | T24 to T29, T31 |
| [design-system.md](design-system.md) | Contrast, tokens, square corners, fonts, page numbers, targets, focus, house words | T30, T32 to T38 |
