# littleaicompany.com

The public website for [The Little AI Company](https://littleaicompany.com).
Five pages and a 404 page: home, Callout, Vivary, about, contact. Each of the
five pages also has a dark version under `/dark/`. Static, with no JavaScript,
no cookies, and no third-party requests.

## Stack

- Astro 7, static output. The build writes plain HTML and CSS to `dist/`.
- Vitest unit tests against the built `dist/` and the sources: design tokens,
  contrast, copy rules, page structure, the two variants, links, fonts, and
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
| `src/data/pages.ts` | The page-number map. Every three-digit number on the site comes from here, with the helpers that turn a number into a link in the light or the dark variant. |
| `src/data/tools.ts` | The two tools, Callout and Vivary: copy, status, links, and where the version comes from. Edit here first. |
| `src/data/mark.ts` | The skull bunny mark as one SVG path on a 10 by 11 pixel grid. |
| `src/data/types.ts` | `Term`, a name and what it means: a row of the Callout facts plate. |
| `src/layouts/Base.astro` | The page frame: the head, the top strip with the variant link, the header and nav, `main`, the page index, the button bar and the footer. |
| `src/views/` | One file per page: home, Callout, Vivary, about and contact. Each takes a `variant`, light or dark. |
| `src/pages/` | The routes. Each light page and its twin in `src/pages/dark/` renders the same view in its variant. `404.astro` is the page-not-found page, light only. `sitemap.xml.ts` lists the light pages in this folder. |
| `src/components/` | `CalloutPlate` (Callout's facts, on the home and Callout pages) and `Mosaic` (the teletext band). |
| `public/styles/site.css` | The fonts, the light tokens and every rule. |
| `public/styles/dark.css` | The dark tokens and the few rules that change at night. Only the `/dark/` pages load it, after `site.css`. |
| `public/fonts/` | Dela Gothic One (display), Zen Kaku Gothic New 400, 500 and 700 (text) and VT323 (page numbers and labels), as Latin woff2 subsets. Self-hosted under the SIL Open Font License, with the license texts beside them. |
| `public/og.png` | The social card. It still shows the previous design. |
| `public/robots.txt` | Lets every crawler in and names the sitemap. |
| `scripts/icons.mjs` | `pnpm icons` renders the favicons and app icons from the mark. |
| `astro.config.mjs` | The dev server port, and redirects for URLs from the old education-era site. |
| `tests/unit/` | Vitest tests against `dist/` and the sources. |
| `tests/e2e/` | Playwright tests, with axe-core, against `astro preview`. |
| `tests/helpers/` | Helpers shared by both suites: the copy and numbers every test quotes (`spec.ts`), reading `dist/`, parsing HTML and CSS, and computing contrast. |

A tool with a `version` entry in `tools.ts` gets its stamp at build time
from that source (Callout reads the latest GitHub release). The lookup is made
once per build, so every page shows the same version. If it fails, the build
prints a warning and uses the entry's fallback, so update the fallback when you
cut a release. Vivary's prerelease is written once in `tools.ts`.

## Deploy

Every push to `dev` runs `.github/workflows/deploy.yml` and publishes to
GitHub Pages. Merging a pull request into `dev` is the deploy step. Pull
requests, and pushes to `dev`, also run `.github/workflows/ci.yml`, which does
what `pnpm verify` does. A branch is checked once, when its pull request is.

## Brand

The site follows Direction K, "Riso teletext", which Jeff approved on
2026-11-02. It looks like a riso-printed zine: two fluorescent inks, pink and
yellow, plus black on newsprint, with halftone dots and hard offset shadows.
It works like a teletext service: every page and major section has a
three-digit number, a black strip at the top shows the current page, and a row
of colored buttons sits at the bottom. Corners are square, and nothing is
blurred.

Light is the default. The dark version is a second set of static pages under
`/dark/`, reached only through the "Dark version" link on each page. Nothing
reads the visitor's system color setting and nothing stores a choice, because
either would need JavaScript or a cookie. Each dark page sets a dark
background in an inline style, so it never flashes white while its
stylesheets load. Dark pages name their light page as canonical and stay out
of the sitemap.

The skull bunny mark is drawn on a 10 by 11 pixel grid with
`shape-rendering="crispEdges"`. The header shows it in pink. The home page
overprints a yellow copy under a pink one.
