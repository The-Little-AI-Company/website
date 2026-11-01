---
name: verify
description: Prove littleaicompany.com (this repo, a static Astro site with no JavaScript) works the way a visitor sees it. Builds and runs pnpm verify in the repo's pinned container, serves dist with astro preview, drives Chrome through the nav journeys, and judges every row of the answer key against both the build and live production. Use before merging any PR into dev, after a deploy, and whenever a change touches pages, copy, links, the mark or the privacy promise.
---

# Verify littleaicompany.com

The answer key is `acceptance.md` in this folder, read from `origin/dev` only. Every
check gets its expected value from the key or from live production, never from the build
under test. A branch that edits the key fails KEY. The key changes only in its own PR.

The skill runs on two hosts, because each can reach something the other cannot:

| Half | Host | Why |
|---|---|---|
| Live snapshot, `scripts/live.sh` | Any host that reaches `https://littleaicompany.com` (bash, curl, grep only) | The build sandbox's network resets TLS to GitHub Pages and npmjs.com (Daytona, 2026-11-01) |
| Everything else, `scripts/run-all.sh` | The pinned build sandbox, as root | `pnpm verify` needs the repo's reviewed container: Ubuntu 24.04 digest, Node 24.22.1, pnpm 10.34.7, Chrome for Testing 156.0.8078.47 |

## Results

Each row prints one line per side: `PASS`, `FAIL`, `WARN` (T6 only: an external link that
fails without a 5xx) or `KNOWN` (a failure whose path the key lists under Known defects).
Rows the key marks `target, fails on today's production` print `[target]`.

The last line is `VERIFY_RESULT=pass|fail targets_failed_build=N targets_failed_live=N`.

- `pass` means KEY passed, every invariant passed on both sides, every key row produced a
  result (COVER), doctor and cleanup passed.
- Target rows do not change `pass`. Read the counts. A PR that claims a target row must show
  `targets_failed_build=0` for it. After the deploy, `targets_failed_live` must reach 0 too.
- A missing key, container, browser, live snapshot or a snapshot older than 6 hours is FAIL.
  Nothing is skipped.

## Launch

### 1. The build sandbox, once

Create a sandbox from the repo's own image recipe, minus its `COPY` and later lines (those
need a build context), plus the builder user:

```bash
sed '/^COPY /,$d' .github/actions/security-ci/Dockerfile > sandbox.Dockerfile
echo 'RUN useradd --create-home --uid 1001 builder' >> sandbox.Dockerfile
```

On Daytona, pass that file as `buildInfo.dockerfileContent` when you create the sandbox
(4 vCPU, 8 GiB, 10 GiB disk is enough). Then, as root inside it:

```bash
git clone https://github.com/The-Little-AI-Company/website /srv/website
bash /srv/website/.claude/skills/verify/scripts/sandbox-setup.sh /srv/website
# SETUP_RESULT=pass node v24.22.1 chrome Google Chrome for Testing 156.0.8078.47
```

A branch that changes `.github/actions/security-ci/` needs a fresh sandbox. `run-all.sh`
refuses to run when `/opt/company` differs from the checkout.

The sandbox holds no GitHub credential. Check out the branch under test with a read-only
fetch. Commits leave the sandbox as a patch (`git diff --binary`) and are pushed from a host
that has push rights.

### 2. The live snapshot, each run

On a host that reaches production:

```bash
bash .claude/skills/verify/scripts/live.sh /tmp/tlac-live
# LIVE_RESULT=done pages 8 same-origin 36 external 18 out /tmp/tlac-live
```

Copy the folder into the sandbox (for Daytona, the toolbox file upload). It must be less
than 6 hours old when `run-all.sh` reads it.

### 3. The run

```bash
bash /srv/website/.claude/skills/verify/scripts/run-all.sh /root/tlac-live /srv/website
```

Takes about 9 minutes. `pnpm verify` is most of it. The preview is ready when
`LAUNCH_RESULT=pass` prints, which means `GET /` returned 200.

`run-all.sh` does, in order: preflight, KEY, T14 (`pnpm verify` through
`/opt/company/entrypoint.sh` in verify mode, as uid 1001), T10, `launch.sh`, `doctor.sh`,
`checks.mjs`, `browser.mjs`, COVER, `cleanup.sh`.

One difference from CI: Playwright runs with `--workers=2`. The sandbox reports the host's
CPUs inside a 4 CPU cgroup, and Playwright sizes its pool from `os.cpus()`. With the
default pool the run was killed (exit 137). A hosted 4 CPU runner gets 2 workers. `run-all.sh` copies the
entrypoint, changes only that line, and fails if anything else differs.

## Doctor

```bash
bash /srv/website/.claude/skills/verify/scripts/doctor.sh /srv/website
```

Read-only. Passes when the preview session that `launch.sh` started is alive, the process
on port 4420 belongs to that session, `GET /` returns 200, and `dist` was built from the
checkout as it is now (`build-id.sh`: HEAD plus a hash of every uncommitted change).
Run it first whenever a result looks wrong.

## Drive

Run these by hand, after `run-all.sh` built `dist`, to look at one thing again:

```bash
H=/srv/website/.claude/skills/verify/scripts; . $H/env.sh /srv/website
$H/launch.sh /tmp/preview.log /srv/website && $H/doctor.sh /srv/website
as_builder $NODE $H/checks.mjs EVIDENCE/key.json $BUILD_URL $WORK/dist /srv/website/public EVIDENCE/live $WORK EVIDENCE
as_builder $NODE $H/browser.mjs EVIDENCE/key.json $BUILD_URL $WORK EVIDENCE
$H/cleanup.sh /srv/website
```

`EVIDENCE` is a folder writable by the builder user that holds `key.json` and `live/`.

- `checks.mjs` judges the http, html, links and parity rows on both sides, with
  `node-html-parser` from the build's own `node_modules`.
- `browser.mjs` drives the reviewed Chrome (`/opt/google/chrome/chrome`) through
  `@playwright/test`. It finds the nav by its accessible name, `navigation "Main"`, and each
  link by its label from the key's Pages table. The header mark is `header a[href="/"]`.

The feature map in `features/` says which rows prove which visitor feature.

## Evidence

Each run writes `/srv/verify-evidence/<UTC>-<short head>/` (or `$VERIFY_EVIDENCE_ROOT`):

| File | What |
|---|---|
| `summary.txt` | Every result line and `VERIFY_RESULT` |
| `key.md`, `key.json` | The key exactly as read from `origin/dev`, and its parsed rows |
| `pnpm-verify.log` | The full entrypoint output for T14 |
| `checks.json`, `browser.json` | Each row's verdict and details, per side |
| `screens/` | A screenshot after each nav click and a full page of every page |
| `live/` | The live snapshot this run judged |
| `preview.log` | The astro preview output |

Proof standards: the journeys click the real links a visitor clicks, and the http checks
request the real files. Nothing calls a test-only route. A target row passes only on the
text and links a visitor sees. Report the evidence path with the result.

## Cleanup

```bash
bash /srv/website/.claude/skills/verify/scripts/cleanup.sh /srv/website
```

Stops the preview session `launch.sh` started, by session id, never by name, and removes
`/run/tlac-verify`. `run-all.sh` also stops every process of the builder user after T14,
because Playwright's own preview can outlive a killed run. That user exists only for this
skill. Evidence stays. Stop the sandbox itself when you pause.

## Isolation

One run at a time per sandbox. The container paths (`/github/runner_temp/work`, `/source`)
are fixed by `entrypoint.sh`, and the preview uses port 4420. A second run in the same
sandbox would delete the first one's build. Use a second sandbox instead.

## Helpers

| Script | Run as | Purpose |
|---|---|---|
| `scripts/sandbox-setup.sh REPO` | root, once | Installs the pinned toolchain from the repo's security-ci files |
| `scripts/live.sh OUT [SITE]` | anyone, any host | Collects the live snapshot |
| `scripts/run-all.sh LIVE_DIR [REPO]` | root | The whole run |
| `scripts/launch.sh LOG [REPO]` | root | Starts astro preview on 4420 |
| `scripts/doctor.sh [REPO]` | root | Read-only health check |
| `scripts/cleanup.sh [REPO]` | root | Stops what launch started |
| `scripts/build-id.sh REPO` | anyone | Prints the build identity |
| `scripts/key.mjs KEYFILE` | anyone | Parses the key to JSON |
| `scripts/checks.mjs`, `scripts/browser.mjs` | builder | Row checks, see Drive |

To keep this skill true as the site changes, run `/maintain-verification-skill`.
