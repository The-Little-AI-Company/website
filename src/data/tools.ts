import type { Term } from './types';

/** Where a tool's latest release is published. */
export interface VersionSpec {
  /** The GitHub repository, as `owner/name`. */
  repo: string;
  /** Stamped when the lookup fails, so bump it when a release is cut. */
  fallback: string;
}

export interface Tool {
  slug: 'callout' | 'vivary';
  name: string;
  summary: string;
  // The recorded state, as its status label shows it.
  status: string;
  // Absent when the tool has no public release to stamp.
  version?: VersionSpec;
  // A prerelease GitHub does not report as latest: its tag, its page and the day it came out, for the
  // sentences that name it. Present only for a tool whose status is a prerelease.
  prerelease?: { tag: string; href: string; date: string };
  primary: { label: string; href: string };
  repo: string;
  // Where the work still needed for the next release is listed in the open, when it is.
  queue?: string;
}

export const callout = {
  slug: 'callout',
  name: 'Callout',
  summary:
    'Press a hotkey over anything you are reading. A small popover tells you whether the text is trying to manipulate you, and whether its claims hold up against sources it fetched.',
  status: 'Released',
  version: { repo: 'The-Little-AI-Company/callout', fallback: 'v0.2.0' },
  primary: { label: 'Download for Windows', href: 'https://github.com/The-Little-AI-Company/callout/releases/latest/download/Callout-Setup.exe' },
  repo: 'https://github.com/The-Little-AI-Company/callout',
} satisfies Tool;

// The one place Vivary's current release is written. The home page's news tag and the Vivary page read it.
const prerelease = {
  tag: 'v0.1.0-beta.1',
  href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1',
  date: 'Nov 1, 2026',
};

export const vivary = {
  slug: 'vivary',
  name: 'Vivary',
  summary:
    'A desktop workspace for working with AI agents on your own projects. Agent chat, project files, tools, and memory in one app. It runs on your Windows computer and needs no Vivary account.',
  status: 'Beta',
  prerelease,
  primary: { label: `Download ${prerelease.tag.slice(1)}`, href: prerelease.href },
  repo: 'https://github.com/vivary-dev/vivary',
  queue: 'https://github.com/vivary-dev/vivary/milestone/1',
} satisfies Tool;

export const tools: readonly Tool[] = [callout, vivary];

/**
 * The facts plate for Callout. The home page and the Callout page both show it, so they cannot
 * disagree about what Callout runs on, what it is licensed under, or which version is out.
 */
export function calloutPlate(version: string): { rows: Term[]; quote: string; caption: string } {
  return {
    rows: [
      { term: 'Runs on', detail: 'Windows 10 and 11' },
      { term: 'Version', detail: version },
      { term: 'License', detail: 'MIT' },
      { term: 'API keys', detail: 'Yours, kept in Windows Credential Manager' },
    ],
    quote: 'Signals in the text itself. Not a truth check.',
    caption: 'The header on every Callout result.',
  };
}

// One lookup per tool for the whole build (and dev session), so every page stamps the same version.
const lookups = new Map<string, Promise<string>>();

/**
 * The latest release of a tool, read from GitHub at build time so a release needs no edit here.
 * Any failure falls back to the registered version, and says so once.
 */
export function latestVersion(spec: VersionSpec): Promise<string> {
  let lookup = lookups.get(spec.repo);
  if (!lookup) {
    lookup = fetchLatestVersion(spec);
    lookups.set(spec.repo, lookup);
  }
  return lookup;
}

async function fetchLatestVersion({ repo, fallback }: VersionSpec): Promise<string> {
  const fallBack = (why: string): string => {
    console.warn(`[tools] ${repo}: ${why}, stamping the fallback ${fallback}`);
    return fallback;
  };
  const token = process.env['GITHUB_TOKEN'];
  const ask = (credentials?: string) =>
    fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: credentials ? { Authorization: `Bearer ${credentials}` } : {},
      signal: AbortSignal.timeout(5000),
    });
  try {
    let res = await ask(token);
    // A stale or placeholder token gets a 401 even though the repository is public.
    if (res.status === 401 && token) res = await ask();
    if (!res.ok) return fallBack(`the release lookup answered HTTP ${res.status}`);
    const { tag_name: tag } = (await res.json()) as { tag_name?: unknown };
    if (typeof tag !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(tag)) return fallBack(`the latest release tag is ${JSON.stringify(tag)}, not a version`);
    return tag.startsWith('v') ? tag : `v${tag}`;
  } catch (error) {
    return fallBack(`the release lookup failed (${error instanceof Error ? error.message : String(error)})`);
  }
}
