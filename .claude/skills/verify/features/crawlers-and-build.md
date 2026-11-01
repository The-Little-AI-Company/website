# Crawlers and the build

Rows T12 to T14.

## Sub-features

- `/robots.txt`: 200, `text/plain`, `Allow: /` and the sitemap line (T12).
- `/sitemap.xml`: 200, lists exactly the five page URLs from the key (T13).
- `pnpm verify` passes in the pinned container: runtime and manager policy, `astro check`,
  the guarded build with `pnpm audit`, vitest, and Playwright with axe-core (T14).

## How to get to it (user POV)

A crawler requests `/robots.txt`, follows it to `/sitemap.xml`, and finds the five pages.

## Driving it with fetch and the repo entrypoint

- `checks.mjs` requests both files on both sides.
- `run-all.sh` runs `/opt/company/entrypoint.sh` in verify mode as uid 1001, the same
  sequence CI runs, and keeps the output in `pnpm-verify.log`.

## Gotchas

- `sitemap.xml` content type: GitHub Pages sends `application/xml`, which the key requires.
  astro preview sends `text/xml`, so only the live side checks the type. The build side
  checks status and contents.
- T14 fails whenever a new advisory reaches the locked dependencies, because `pnpm audit`
  runs at `--audit-level=low` inside the build. That happened on 2026-11-01 (fast-uri,
  fixed by PR #69). Read `pnpm-verify.log` before suspecting the branch.
- The audit and Chrome downloads need registry.npmjs.org and storage.googleapis.com. The
  sandbox reaches both.
