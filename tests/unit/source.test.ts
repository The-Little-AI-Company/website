/**
 * Guards on the source that the built pages cannot show: no page injects raw HTML, nothing is typed
 * `any`, and no source reads the OS color setting.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC, listFiles } from '../helpers/dist';

const read = (file: string): string => readFileSync(join(SRC, file), 'utf-8');

/** Code only: the frontmatter of an .astro file, or a whole .ts file. */
const code = (file: string): string => (file.endsWith('.astro') ? (/^---\n([\s\S]*?)\n---/.exec(read(file).replace(/\r/g, ''))?.[1] ?? '') : read(file));

describe('src/', () => {
  const sources = () => listFiles(SRC).filter((f) => /\.(?:astro|ts)$/.test(f));

  it("never injects raw HTML: no .astro file uses set:html, so every string goes through Astro's escaping", () => {
    const files = sources().filter((f) => f.endsWith('.astro'));
    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((file) => read(file).includes('set:html'))).toEqual([]);
  });

  it('ships no client script from any .astro file', () => {
    expect(sources().filter((file) => file.endsWith('.astro') && /<script[\s>]/i.test(read(file)))).toEqual([]);
  });

  it('has no `any` and no unexplained type suppression', () => {
    const found: string[] = [];
    for (const file of sources()) {
      const stripped = code(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
      for (const m of stripped.matchAll(/(?::\s*any\b|\bas\s+any\b|<any\b|\bany\[\]|\bArray<any>|@ts-ignore|@ts-nocheck)/g)) found.push(`src/${file}: ${m[0]}`);
      if (/@ts-expect-error\s*$/m.test(code(file))) found.push(`src/${file}: @ts-expect-error without a reason`);
    }
    expect(found).toEqual([]);
  });

  it('never reads the OS color setting', () => {
    expect(listFiles(SRC).filter((f) => /prefers-color-scheme/i.test(read(f)))).toEqual([]);
  });
});
