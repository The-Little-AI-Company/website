import type { HTMLElement } from 'node-html-parser';
import { textOf } from './text';

export type El = HTMLElement;

/** Short description of an element for failure messages: `<a href="/x" class="btn">Go</a>`. */
export function show(el: El): string {
  const tag = el.rawTagName.toLowerCase();
  const attrs = Object.entries(el.attributes)
    .filter(([name]) => !name.startsWith('data-astro'))
    .map(([name, value]) => (value === '' ? name : `${name}="${value}"`))
    .join(' ');
  const text = textOf(el);
  return `<${tag}${attrs ? ` ${attrs}` : ''}>${text.length > 40 ? `${text.slice(0, 40)}...` : text}`;
}

/** All elements matching `selector`, in document order. */
export function all(root: El, selector: string): El[] {
  return root.querySelectorAll(selector);
}

/** The single element matching `selector`. Throws a readable error for zero or several. */
export function one(root: El, selector: string, where = 'the page'): El {
  const found = root.querySelectorAll(selector);
  if (found.length !== 1) {
    throw new Error(`Expected exactly one element matching \`${selector}\` in ${where}, found ${found.length}.`);
  }
  return found[0]!;
}

export const attr = (el: El, name: string): string | undefined => el.getAttribute(name) ?? undefined;
