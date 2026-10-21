# littleaicompany.com

The public website for [The Little AI Company](https://littleaicompany.com).
Five pages and a 404 page: home, Callout, Vivary, about, contact. Static, with
no JavaScript, no cookies, and no third-party requests.

## Stack

- Astro 7, static output. The build writes plain HTML and CSS to `dist/`.
- Vitest unit tests against the built `dist/` and the sources: design tokens,
  contrast, copy rules, page structure, links, fonts, image weight, and
  html-validate.
- Playwright and axe-core end-to-end tests in Chromium, run against
  `astro preview`.
- GitHub Pages, custom domain in `public/CNAME`.

## Work on it

CI uses Node.js 22.23.4. The Pages build uses Node.js 24.22.1, preserving the
Astro action's default major version.
Run `pnpm check:node` to check your executable and `pnpm test:node` to test the
version policy without installing dependencies.

The guard checks `process.versions.node`. It rejects unsupported release lines,
prereleases, versions below the [October 21, 2026 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
and lines that reach their [scheduled end of life](https://github.com/nodejs/Release/blob/main/schedule.json).
The accepted floors are 22.23.4, 24.22.1, and 26.12.1. Update the policy and CI
pins when a later advisory changes these floors.

Every build also runs `pnpm audit --audit-level=low` against the lockfile's
production and development dependencies. An advisory or registry error stops the
build before Astro runs. This dependency check is separate from the Node check.
Node runs at build time. GitHub Pages serves the static output.

```sh
pnpm install
pnpm dev
```

The dev server runs at `http://127.0.0.1:4399`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the dev server at `http://127.0.0.1:4399`. |
| `pnpm build` | Builds the static site into `dist/`. |
| `pnpm preview` | Serves the built `dist/`. |
| `pnpm check` | Runs `astro check`. Hints count as failures. |
| `pnpm test` | Runs the unit tests. They read `dist/`, so run `pnpm build` first, and again after any change to `src/` or `public/`. A stale build stops the run and says so. |
| `pnpm test:e2e` | Runs the Playwright checks (the `chromium` project) against `astro preview` on port `E2E_PORT` (default 4400). It needs a build too. |
| `pnpm verify` | Runs `check`, `build`, `test` and `test:e2e`, in that order. |
| `pnpm screenshots` | Runs the `screenshots` Playwright project, which writes full-page screenshots of every page, at 360 and 1280 pixels in both color schemes, to `test-results/screenshots/`. They are for review, not baselines. |
| `pnpm images` | Writes the smaller WebP copies in `public/images/` that `srcset` serves to narrow screens. Run it after replacing a source image. |
| `pnpm og` | Renders the social card, `public/og.png`. |
| `pnpm icons` | Renders the app icons under `public/`. |

The end-to-end tests check every page at several widths from 320 to 1440 pixels,
in both color schemes. The same checks run in GitHub Actions on every pull
request (`.github/workflows/ci.yml`). When they fail there, the workflow keeps
the Playwright report and the traces of the failed tests for a week, as the
`playwright-results` artifact of the run.

### Browsers

Locally, the Playwright tests do not download a browser. They use the Chromium
that `PLAYWRIGHT_BROWSERS_PATH` points at. On a machine without one, run
`pnpm exec playwright install chromium` once. CI installs its own.

Two dependencies are pinned to an exact version, each for a reason:

- `@playwright/test` is `1.56.1`, the release that matches the Chromium build
  pre-installed here. A Playwright release is tested against one Chromium build,
  so bump the two together. CI installs the matching one with
  `playwright install chromium`.
- `sharp` is `0.34.5`, the version Astro already installs for its image service,
  so pnpm keeps a single copy. `pnpm images` and `pnpm icons` write files that
  are committed, and the PNG decoder in the tests is checked against sharp. A
  different libvips can encode different bytes, so a bump changes those files
  without anyone editing their source. Move it together with Astro, then run
  `pnpm images` and `pnpm icons` and commit what changes.

### The social card and the icons

`public/og.png` is generated. To change it, edit the card in `scripts/og.mjs`
(or the tokens or the mark it reads), then run `pnpm og`. The script renders the
card in Chromium at 1200 by 630 pixels. Commit the PNG together with the script.

The app icons, `apple-touch-icon.png`, `icon-192.png` and `icon-512.png`, are
exports of the same mark. Run `pnpm icons` after changing the mark.

## Where things live

| Path | What |
| --- | --- |
| `src/data/tools.ts` | The two tools, Callout and Vivary: copy, status, links, and where the version comes from. Edit here first. |
| `src/data/projects.ts` | The other projects on the home page, as the design system recorded them. |
| `src/data/status.ts` | The status tones that `StatusBadge` and `NowLine` turn into dot colors. |
| `src/data/types.ts` | `Term`, a name and what it means: a spec row of `SpecPlate`, or a lane. |
| `src/pages/` | One file per page: home, Callout, Vivary, about, contact, and the 404 page. `sitemap.xml.ts` writes the sitemap from the pages in this folder. |
| `src/components/` | The shared pieces, listed below. |
| `src/layouts/Base.astro` | The page frame: the head (title, description, Open Graph, theme colors, font preloads), the skip link, the header, `main`, and the footer. |
| `src/styles/tokens.css` | The design tokens as CSS custom properties, written from `design/tokens.json`. Colors, spacing, radii, layout and font families all come from here. |
| `src/styles/global.css` | The font faces, the reset, the type scale, the shared layout classes, and the one 860px breakpoint. |
| `design/tokens.json` | The company design system tokens, vendored unchanged. This is the source of truth. A unit test keeps `tokens.css` in sync with it. |
| `public/fonts/` | Instrument Serif (headlines, and its italic for captions) and Instrument Sans (text). Self-hosted under the SIL Open Font License, with the license texts beside them. |
| `public/images/` | The WebP images: the Vivary mascot, the screenshots, the project plates, and their smaller copies. |
| `public/og.png` | The social card, generated by `scripts/og.mjs`. |
| `public/robots.txt` | Lets every crawler in and names the sitemap. |
| `scripts/` | `images.mjs` (smaller image copies), `og.mjs` (the social card) and `icons.mjs` (the app icons), with `lib.mjs` for what the last two share: the light tokens and the mark as SVG. |
| `astro.config.mjs` | The dev server port, and redirects for URLs from the old education-era site. |
| `tests/unit/` | Vitest tests against `dist/` and the sources. |
| `tests/e2e/` | Playwright tests, with axe-core, against `astro preview`. |
| `tests/helpers/` | Helpers shared by both suites: the copy and numbers every test quotes (`spec.ts`), reading `dist/`, parsing HTML and CSS, decoding images, and computing contrast. |

The components in `src/components/`:

- `Button`: a link styled as a button, primary or secondary.
- `Dotted`: text whose middle dots are set as separators. The text keeps an ordinary space on each side of the dot, and a margin evens out the gap.
- `Lanes` and `Lane`: ruled rows, each a name in the display face and what it means. A row sets the name beside the meaning when it has room, and stacks them when it does not.
- `Mark`: the skull bunny, drawn in `currentColor`.
- `NowLine`: the sentence at the top of a page about what is happening now, with a status dot.
- `PageHead`: the top of an inner page, an h1 and a lede, with room for buttons, a badge, and a picture beside the text when both have room, and under it when they do not.
- `Plate` and `PlateFrame`: a screenshot in a frame, like a plate in a book, with a dated caption in the `caption` slot. A frame that is a `div` (the `SpecPlate` one) takes no caption.
- `ProjectEntry`: one row of the list of other projects on the home page.
- `ProjectFeature`: a project as a short case study, with its plate beside it.
- `SiteFooter` and `SiteNav`: the footer, and the header with the four page links.
- `SpecPlate`: a plate of facts for a tool that has no screenshot, with the line the tool says.
- `SplitSection`: a section with its heading and introduction in a narrow column and the content beside it. The heading's baseline sits on the first baseline of the content.
- `StatusBadge`: a project's status, a dot and a word. The word is always shown.
- `ToolHero`: the header of a tool page, a `PageHead` with the tool's status, summary and buttons.

A tool with a `version` entry in `tools.ts` gets its stamp at build time
from that source (Callout reads the latest GitHub release). The lookup is made
once per build, so every page shows the same version. If it fails, the build
prints a warning and uses the entry's fallback, so update the fallback when you
cut a release. A tool without a `version` entry shows its `status` instead
(Vivary, until it has a public release).

## Deploy

Every push to `dev` runs `.github/workflows/deploy.yml` and publishes to
GitHub Pages. Merging a pull request into `dev` is the deploy step. Pull
requests, and pushes to `dev`, also run `.github/workflows/ci.yml`, which does
what `pnpm verify` does. A branch is checked once, when its pull request is.

## Brand

The site follows the company design system, Direction D, "Private Press".
Headlines are set in Instrument Serif and text in Instrument Sans. The light
scheme uses ivory and oxblood, and the dark scheme uses warm charcoal and
dusty rose. The site follows the visitor's system setting. There is no toggle,
because a toggle would need JavaScript. The tokens are vendored at
`design/tokens.json`, and `src/styles/tokens.css` is the CSS copy that the
tests check against it.

The skull bunny mark is defined in the organization's brand guide, `brand/BRAND.md`
in [`The-Little-AI-Company/.github`](https://github.com/The-Little-AI-Company/.github).
The mark on this site follows that guide, and the icons under `public/` are
exports of it.
