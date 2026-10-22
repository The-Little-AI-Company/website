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

Use a reviewed disposable build container. The temporary CI pins Node.js 24.22.1
and pnpm 10.34.7. Its browser policy pins Playwright 1.64.1 and Chrome for Testing
156.0.8078.47. Use the authenticated artifacts and applicable approval scope
recorded in the security review. A version declaration alone is insufficient.

After the qualified installation, run `pnpm dev` and open
http://127.0.0.1:4399. This address and port come from `astro.config.mjs`.
Run `pnpm check:node` and `pnpm test:node` to check the runtime policy without
installing dependencies. The complete check remains `pnpm verify`: runtime
controls, strict Astro checks, a guarded build, `pnpm test` and Playwright tests.

The guard checks the executable's actual `process.versions.node`. It rejects
unsupported release lines, prereleases, versions below the
[October 21, 2026 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
and lines that reach their
[scheduled end of life](https://github.com/nodejs/Release/blob/main/schedule.json).
The accepted floors are 22.23.4, 24.22.1 and 26.12.1. Update the policy and CI pins
when a later advisory changes them.

The CI uses three images: native exact-commit checkout, application verification
and runtime-credential handoff. Their builds receive no credentials, build secrets
or credential mounts. The verifier receives read-only source and private writable
data. Its root filesystem and image-owned runtime, manager and policy files are
read-only. It runs without capabilities or a Docker socket and receives no checkout,
artifact or OIDC runtime credentials.

Checkout credentials enter only the checkout container at runtime. The separate
handoff action initially receives GitHub's supported runtime values and the
runner-provided socket mount. Its image-owned `setpriv` entrypoint drops privileges
before the capture script reads those values. That script requires zero
capabilities, no new privileges and no socket write access. The host runner and
Docker daemon remain trusted.

The images use the pinned Ubuntu base, signed official Ubuntu package chains and
an installed package inventory. Bootstrap verifies the approved Node archive and
extracts only its executable. It never activates bundled npm, Corepack or Yarn.
The pnpm archive, browser archive and extracted payloads retain their integrity
and path checks. Every manager phase checks its fixed runtime and project inputs.

The audit includes development dependencies. Its strict schema distinguishes
403 locked package identities from 405 native audit-tree entries. Passing that
schema or seeing an empty finding list does not prove actual request coverage or
complete clearance against current vendor advisories. The manager's bundled
dependencies and the fixed command/configuration paths need their own reviewed
dispositions. Do not substitute another pnpm version or apply those dispositions
to arbitrary repositories.

Artifact packing runs before upload credentials are supplied and rejects
symlinks, hardlinks, special files and paths outside the output tree. The separate
uploader receives only a prepared regular archive read-only. The deploy client
receives no project mount. Neither client receives the host Docker socket.
Private credentials and container data are removed after use, including failures.

The October 22 CI approvals cover exact reviewed test attempts. Fresh artifact
OIDC/build-provenance verification remains incomplete under those scoped
exceptions. Native image construction, launcher and handoff definitions are still
controlled by the source under review. A trusted control boundary remains a merge
blocker. These test approvals do not authorize arbitrary PR execution, merge,
Pages publication, host runtime activation or persistent trust changes. Provider
job hooks also remain outside a workflow step's control.

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
