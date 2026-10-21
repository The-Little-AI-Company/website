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

The temporary CI and Pages pipeline uses Node.js 24.22.1 inside one fixed-runtime container. The security policy also retains the 22.23.3 rejection and 22.23.4 acceptance fixtures.
Run `pnpm check:node` to check your executable and `pnpm test:node` to test the
version policy without installing dependencies.

The guard checks `process.versions.node`. It rejects unsupported release lines,
prereleases, versions below the [October 21, 2026 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
and lines that reach their [scheduled end of life](https://github.com/nodejs/Release/blob/main/schedule.json).
The accepted floors are 22.23.4, 24.22.1, and 26.12.1. Update the policy and CI
pins when a later advisory changes these floors.

Use the reviewed pnpm 11.28.6 artifact. The direct pnpm advisories set an 11.11.0
floor, but that version still bundles affected dependencies. The selected artifact
updates those dependencies. The review on October 21, 2026 also covers the
[published pnpm advisories](https://github.com/pnpm/pnpm/security/advisories),
including [lockfile path traversal](https://github.com/pnpm/pnpm/security/advisories/GHSA-c59q-g84q-2gj5)
and [proxy environment expansion](https://github.com/pnpm/pnpm/security/advisories/GHSA-vx52-2968-3vc6).

The company-only temporary pipeline uses native exact-commit checkout, then
explicit Docker commands. The build container mounts only read-only source and
a fresh private working directory. It runs as the checkout owner, drops all
capabilities and uses a read-only root filesystem. It has no Docker socket or
artifact/OIDC runtime credentials. The original checkout, credential directory
and launcher remain outside its writable mounts.

A tiny trusted Docker action captures GitHub's supported runtime values before
project code runs. The action API automatically mounts the host Docker socket.
Its immutable entrypoint is setpriv, which drops to UID1001:GID65534 with no
supplementary groups or capabilities before bash -p reads any runtime values.
The capture script requires zero capabilities, no-new-privileges and no socket
write access. Loader overrides are explicitly empty. The short trusted root
setpriv startup still requires focused review. The pipeline does not claim that
the handoff action is socket-free, and activation remains held.

The application image uses pinned Ubuntu and the incident-fixed CA package. It
verifies the signed-release-bound Node archive digest before extracting only
Node. It never extracts npm, Corepack or Yarn. Signed apt installs the exact
Playwright1.56.1 Ubuntu24 Chromium library list. Browser download and tests run
without root or package-install privileges.

The trusted image build verifies the reviewed pnpm tarball digest and archive
paths before extracting it without execution into the read-only image. Both
version policies and the project-input check also live in that image. Every
manager phase checks project inputs, the actual runtime and the fixed manager
before invoking its absolute image path. Project tests cannot rewrite those
policies or the manager used later. The full audit includes development dependencies.

The pnpm artifact still includes braces 3.0.3, which matches
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Its [maintainer disputes the untrusted-glob premise](https://github.com/micromatch/braces/issues/70).
This assessment covers the fixed CI commands and reviewed workspace configuration,
which supplies no package glob patterns and uses pnpm's literal `.` default.
It does not clear pnpm for arbitrary repositories or user-supplied glob patterns.
Reassess this boundary when changing workspace patterns or package-manager commands.

Artifact upload and Pages deployment use the official immutable GitHub programs
on the image-owned guarded Node runtime. Separate nonroot containers receive
only the required short-lived credentials. The uploader mounts only a prepared
regular tar file read-only. The deploy client receives no project mount. Neither
client receives the host Docker socket. No custom artifact protocol is implemented.

Output packing happens before credentials are supplied and rejects symlinks,
hardlinks, special files and paths outside the output tree. Pages retains its
normal artifact.tar shape. Playwright results keep the same artifact name and
seven-day retention, but the zip now contains artifact.tar with the report and
test-result directories. Extract that tar to inspect the reports.

The Pages build uses only contents:read. Write and OIDC permissions remain in the
deploy job, which still requires the successful build and github-pages environment.
The private credentials and container data are removed after use, including failures.

This candidate requires an explicit decision on the Node build-provenance gap,
review, exact-head CI and a new production decision before activation. Prior
approval of another commit does not activate this pipeline. Provider job hooks
remain outside a workflow step's control. Native checkout refuses configured
hooks and an older incident CA package instead of bypassing those checks.

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
