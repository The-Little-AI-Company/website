/**
 * src/data/tools.ts: the two tools, the facts plate both Callout pages share, and the release lookup
 * that stamps the Callout version at build time.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callout, calloutPlate, latestVersion, tools, vivary, type VersionSpec } from '../../src/data/tools';
import { SRC, listFiles } from '../helpers/dist';
import { TOOLS_EXPECTED, VERSION_PATTERN } from '../helpers/spec';

describe('tools.ts', () => {
  it('registers Callout then Vivary', () => {
    expect(tools.map((t) => t.name)).toEqual(['Callout', 'Vivary']);
  });

  it('keeps the Callout summary, repository, installer link and a version to fall back on', () => {
    const c = TOOLS_EXPECTED.callout;
    expect(callout.summary).toBe(c.summary);
    expect(callout.repo).toBe(c.repo);
    expect(callout.primary).toEqual(c.primary);
    expect(callout.version.fallback).toMatch(VERSION_PATTERN);
    expect(callout.version.repo, 'the release lookup reads the repository the page links to').toBe(new URL(c.repo).pathname.slice(1));
  });

  it('gives the facts plate the version it is handed', () => {
    const plate = calloutPlate('v9.8.7');
    expect(plate.rows.find((row) => row.term === 'Version')?.detail).toBe('v9.8.7');
  });

  it('points Vivary at its beta.1 release, its repository and its release queue', () => {
    const v = TOOLS_EXPECTED.vivary;
    expect(vivary.status).toBe(v.status);
    expect(vivary.prerelease).toEqual(v.prerelease);
    expect(vivary.primary).toEqual(v.primary);
    expect(vivary.repo).toBe(v.repo);
    expect(vivary.queue).toBe(v.queue);
  });

  it('writes the Vivary prerelease once: no other file in src/ types its date or URL again', () => {
    const typedAgain = listFiles(SRC).filter((file) => {
      const text = readFileSync(join(SRC, file), 'utf-8');
      return file !== 'data/tools.ts' && (text.includes(vivary.prerelease.date) || text.includes(vivary.prerelease.href));
    });
    expect(typedAgain.map((file) => `src/${file}`)).toEqual([]);
  });

  it('never names the repository by its former name, Vivary-New, anywhere in src/', () => {
    expect(listFiles(SRC).filter((file) => /Vivary-New/i.test(readFileSync(join(SRC, file), 'utf-8')))).toEqual([]);
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
});
