/**
 * The data the pages are built from: src/data/tools.ts (the two tools, the release lookup and the facts
 * plate) and src/data/projects.ts (the four other things made). Each record is compared with the
 * expected copy in helpers/spec.ts field by field, so a swapped or dropped field fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projects } from '../../src/data/projects';
import { callout, calloutPlate, latestVersion, stampedStatus, tools, vivary, type VersionSpec } from '../../src/data/tools';
import { PUBLIC, SRC, listFiles } from '../helpers/dist';
import { CALLOUT_PAGE, CALLOUT_PLATE, PROJECTS, TOOLS_EXPECTED, VERSION_PATTERN } from '../helpers/spec';

/** Every string anywhere inside a value, depth first. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

const urls = (value: unknown): string[] => strings(value).filter((s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s));
const imagePaths = (value: unknown): string[] => strings(value).filter((s) => s.startsWith('/images/'));

describe('tools.ts', () => {
  it('registers Callout then Vivary', () => {
    expect(tools.map((t) => t.slug)).toEqual(['callout', 'vivary']);
    expect(callout.name).toBe('Callout');
    expect(vivary.name).toBe('Vivary');
  });

  it.each([callout, vivary])('$name has non-empty copy and https URLs', (t) => {
    for (const field of ['name', 'tagline', 'summary', 'status'] as const) {
      expect(t[field].trim(), `${t.slug}.${field}`).not.toBe('');
    }
    expect(t.primary.label.trim()).not.toBe('');
    for (const url of urls(t)) expect(url, `${t.slug}: ${url}`).toMatch(/^https:\/\/[^\s]+$/);
    for (const url of [t.primary.href, t.repo]) expect(url).toMatch(/^https:\/\//);
  });

  describe('Callout', () => {
    const c = TOOLS_EXPECTED.callout;

    it('keeps its summary, repository, installer link and a version to fall back on', () => {
      expect(callout.summary).toBe(c.summary);
      expect(callout.repo).toBe(c.repo);
      expect(callout.primary).toEqual(c.primary);
      expect(callout.tagline).toBe(CALLOUT_PAGE.lede);
      expect(callout.version.fallback).toMatch(VERSION_PATTERN);
      expect(callout.version.repo, 'the release lookup reads the repository the page links to').toBe(new URL(c.repo).pathname.slice(1));
    });

    it('shares one facts plate between the home page and its own page, with the version it is given', () => {
      const plate = calloutPlate('v9.8.7');
      expect(plate.rows).toEqual(CALLOUT_PLATE.rows.map((row) => ({ term: row.term, detail: row.term === 'Version' ? 'v9.8.7' : row.detail })));
      expect(plate.quote).toBe(CALLOUT_PLATE.quote);
      expect(plate.caption).toBe(CALLOUT_PLATE.quoteCaption);
    });
  });

  describe('Vivary points at its own site and the renamed repository', () => {
    const v = TOOLS_EXPECTED.vivary;

    it('has the beta.1 status', () => {
      expect(vivary.status).toBe(v.status);
    });

    it('has the beta.1 download as its primary link', () => {
      expect(vivary.primary).toEqual(v.primary);
    });

    it('has the vivary-dev/vivary repository', () => {
      expect(vivary.repo).toBe(v.repo);
    });

    it('has its release queue, which the Status section links to', () => {
      expect(vivary.queue).toBe(v.queue);
    });

    it('has no version to stamp, so the status shows instead', () => {
      expect('version' in vivary).toBe(false);
    });

    it('writes its prerelease once: the status and primary link are built from it, and no page or component types the date or URL again', () => {
      expect(vivary.prerelease).toEqual(v.prerelease);
      expect(vivary.status).toBe(`Beta · ${vivary.prerelease.tag} · ${vivary.prerelease.date}`);
      expect(vivary.primary.href).toBe(vivary.prerelease.href);
      const typedAgain = listFiles(SRC).filter((file) => {
        const text = readFileSync(join(SRC, file), 'utf-8');
        return file !== 'data/tools.ts' && (text.includes(vivary.prerelease.date) || text.includes(vivary.prerelease.href));
      });
      expect(typedAgain.map((file) => `src/${file}`)).toEqual([]);
    });
  });

  it('names the repository vivary-dev/vivary and never by its former name, Vivary-New, anywhere in src/', () => {
    const found: string[] = [];
    for (const file of listFiles(SRC)) {
      if (/Vivary-New/i.test(readFileSync(join(SRC, file), 'utf-8'))) found.push(`src/${file}`);
    }
    expect(found).toEqual([]);
  });

  describe('latestVersion', () => {
    // A lookup is remembered for the whole run, so each test asks about a repository of its own.
    let count = 0;
    const spec = (): VersionSpec => ({ repo: `test/lookup-${++count}`, fallback: 'v1.0.0' });
    const answer = (body: unknown, init?: ResponseInit) => vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), init)));
    const warn = () => vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('prefixes a bare version with v and keeps one that has it', async () => {
      vi.stubGlobal('fetch', answer({ tag_name: '0.3.1' }));
      expect(await latestVersion(spec())).toBe('v0.3.1');
      vi.stubGlobal('fetch', answer({ tag_name: 'v0.4.0' }));
      expect(await latestVersion(spec())).toBe('v0.4.0');
    });

    it('asks once per repository and gives every caller the same answer', async () => {
      const fetcher = answer({ tag_name: 'v2.0.0' });
      vi.stubGlobal('fetch', fetcher);
      const same = spec();
      expect(await Promise.all([latestVersion(same), latestVersion(same), latestVersion(same)])).toEqual(['v2.0.0', 'v2.0.0', 'v2.0.0']);
      expect(fetcher).toHaveBeenCalledTimes(1);
      vi.stubGlobal('fetch', answer({ tag_name: 'v3.0.0' }));
      expect(await latestVersion(same), 'a later answer does not change what was stamped').toBe('v2.0.0');
    });

    it('falls back, and says why, when the request fails', async () => {
      const logged = warn();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      expect(await latestVersion(spec())).toBe('v1.0.0');
      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]?.[0])).toMatch(/offline.*fallback v1\.0\.0/);
    });

    it('falls back, and says why, when GitHub answers with an error', async () => {
      const logged = warn();
      vi.stubGlobal('fetch', answer({}, { status: 403 }));
      expect(await latestVersion(spec())).toBe('v1.0.0');
      expect(String(logged.mock.calls[0]?.[0])).toMatch(/HTTP 403/);
    });

    it.each([undefined, '', 'nightly', 'v1.2', 'latest', '1.2.3-beta', 42])('falls back rather than stamp the tag %j', async (tag) => {
      const logged = warn();
      vi.stubGlobal('fetch', answer({ tag_name: tag }));
      expect(await latestVersion(spec())).toBe('v1.0.0');
      expect(logged).toHaveBeenCalledTimes(1);
    });

    it('sends the token as a bearer token when GITHUB_TOKEN is set, and no credentials when it is not', async () => {
      const fetcher = answer({ tag_name: 'v1.1.1' });
      vi.stubGlobal('fetch', fetcher);
      vi.stubEnv('GITHUB_TOKEN', 'secret-token');
      await latestVersion(spec());
      vi.stubEnv('GITHUB_TOKEN', '');
      await latestVersion(spec());
      const headers = fetcher.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1].headers);
      expect(headers[0]).toEqual({ Authorization: 'Bearer secret-token' });
      expect(headers[1]).toEqual({});
    });

    it('asks again without credentials when GitHub rejects the token, since the repository is public', async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tag_name: 'v1.4.0' })));
      vi.stubGlobal('fetch', fetcher);
      vi.stubEnv('GITHUB_TOKEN', 'stale-token');
      expect(await latestVersion(spec())).toBe('v1.4.0');
      const headers = fetcher.mock.calls.map((call) => (call as [string, RequestInit])[1].headers);
      expect(headers).toEqual([{ Authorization: 'Bearer stale-token' }, {}]);
    });

    it('does not ask twice when a request without credentials is rejected', async () => {
      const logged = warn();
      const fetcher = answer({}, { status: 401 });
      vi.stubGlobal('fetch', fetcher);
      vi.stubEnv('GITHUB_TOKEN', '');
      expect(await latestVersion(spec())).toBe('v1.0.0');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]?.[0])).toMatch(/HTTP 401/);
    });

    it('reads the latest release of the repository it is given', async () => {
      const fetcher = answer({ tag_name: 'v1.1.1' });
      vi.stubGlobal('fetch', fetcher);
      const { repo } = spec();
      await latestVersion({ repo, fallback: 'v1.0.0' });
      expect(String((fetcher.mock.calls[0] as unknown as [string])[0])).toBe(`https://api.github.com/repos/${repo}/releases/latest`);
    });
  });

  describe('stampedStatus', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('is the recorded status alone for a tool with no release to stamp', async () => {
      expect(await stampedStatus(vivary)).toBe(vivary.status);
    });

    it('adds the latest release for a tool that has one', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ tag_name: 'v0.2.0' }))));
      expect(await stampedStatus({ ...callout, version: { repo: 'test/stamped', fallback: 'v0.0.1' } })).toBe('Released · v0.2.0');
    });
  });
});

describe('projects.ts', () => {
  it('lists the four projects, in the order of the page, each field as the copy expects', () => {
    expect(projects).toStrictEqual(
      PROJECTS.map((p) => ({
        title: p.title,
        line: p.line,
        tone: p.tone,
        status: p.status,
        href: p.href,
        linkLabel: p.linkLabel,
        image: p.image.src,
        thumb: p.thumb.src,
        width: p.image.width,
        height: p.image.height,
        imageAlt: `${p.title} home page`,
      })),
    );
  });

  it('has only non-empty strings and https URLs', () => {
    for (const s of strings(projects)) expect(s.trim(), 'empty string in projects.ts').not.toBe('');
    for (const url of urls(projects)) expect(url).toMatch(/^https:\/\/[^\s/]+\.[^\s/]+/);
  });

  it('points every image at a file in public/images', () => {
    const paths = imagePaths(projects);
    expect(paths, 'a picture and a thumbnail for each of the four').toHaveLength(8);
    for (const path of paths) expect(existsSync(join(PUBLIC, path)), path).toBe(true);
  });
});
