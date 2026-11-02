/**
 * A small CSS reader for the tests. It is not a full CSS parser: it understands
 * exactly what this site's stylesheets contain.
 *
 * It handles comments, strings, parentheses (so `url(data:...;base64,...)` does
 * not end a declaration early), nested at-rules, and CSS nesting.
 */

export interface Declaration {
  /** Lower-cased, except custom properties which keep their case. */
  prop: string;
  value: string;
  important: boolean;
}

export interface CssBlock {
  kind: 'rule' | 'at';
  /** Selector text for rules; parameters for at-rules (`(width<=860px)`). */
  prelude: string;
  /** Lower-cased at-rule name without the `@`; empty for style rules. */
  name: string;
  hasBlock: boolean;
  declarations: Declaration[];
  children: CssBlock[];
}

export interface DeclarationContext {
  declaration: Declaration;
  /** The owning block last; ancestors first. */
  chain: CssBlock[];
}

/** Replaces comments with a space, leaving strings alone. */
export function stripComments(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const c = css[i]!;
    if (c === '"' || c === "'") {
      const end = skipString(css, i);
      out += css.slice(i, end);
      i = end;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      out += ' ';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function skipString(s: string, start: number): number {
  const quote = s[start];
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === '\\') i += 2;
    else if (s[i] === quote) return i + 1;
    else i++;
  }
  return s.length;
}

interface Cursor {
  i: number;
}

function parseDeclaration(text: string): Declaration | undefined {
  const colon = text.indexOf(':');
  if (colon === -1) return undefined;
  const rawProp = text.slice(0, colon).trim();
  if (!rawProp) return undefined;
  let value = text.slice(colon + 1).trim();
  const important = /!\s*important\s*$/i.test(value);
  if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
  const prop = rawProp.startsWith('--') ? rawProp : rawProp.toLowerCase();
  return { prop, value, important };
}

function parseList(src: string, cur: Cursor, nested: boolean): { declarations: Declaration[]; children: CssBlock[] } {
  const declarations: Declaration[] = [];
  const children: CssBlock[] = [];
  while (cur.i < src.length) {
    while (cur.i < src.length && /\s/.test(src[cur.i]!)) cur.i++;
    if (cur.i >= src.length) break;
    if (src[cur.i] === '}') {
      cur.i++;
      if (nested) return { declarations, children };
      continue;
    }
    const start = cur.i;
    let depth = 0;
    while (cur.i < src.length) {
      const c = src[cur.i]!;
      if (c === '"' || c === "'") {
        cur.i = skipString(src, cur.i);
        continue;
      }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (c === ';' || c === '{' || c === '}')) break;
      cur.i++;
    }
    const text = src.slice(start, cur.i).trim();
    const terminator = src[cur.i] ?? '';
    if (terminator === '{') {
      cur.i++;
      const inner = parseList(src, cur, true);
      if (text.startsWith('@')) {
        const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(text);
        children.push({
          kind: 'at',
          name: (m?.[1] ?? '').toLowerCase(),
          prelude: (m?.[2] ?? '').trim(),
          hasBlock: true,
          ...inner,
        });
      } else {
        children.push({ kind: 'rule', name: '', prelude: text, hasBlock: true, ...inner });
      }
    } else {
      if (terminator === ';') cur.i++;
      if (text.startsWith('@')) {
        const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(text);
        children.push({
          kind: 'at',
          name: (m?.[1] ?? '').toLowerCase(),
          prelude: (m?.[2] ?? '').trim(),
          hasBlock: false,
          declarations: [],
          children: [],
        });
      } else if (text) {
        const decl = parseDeclaration(text);
        if (decl) declarations.push(decl);
      }
    }
  }
  return { declarations, children };
}

export function parseCss(css: string): CssBlock[] {
  const { children } = parseList(stripComments(css), { i: 0 }, false);
  return children;
}

/** Every declaration in the sheet with the chain of blocks that contain it. */
export function declarations(nodes: CssBlock[], chain: CssBlock[] = []): DeclarationContext[] {
  const found: DeclarationContext[] = [];
  for (const node of nodes) {
    const here = [...chain, node];
    for (const declaration of node.declarations) found.push({ declaration, chain: here });
    found.push(...declarations(node.children, here));
  }
  return found;
}

/** Every block (rules and at-rules) in the sheet, depth first. */
export function allBlocks(nodes: CssBlock[]): CssBlock[] {
  return nodes.flatMap((node) => [node, ...allBlocks(node.children)]);
}

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

const isRoot = (block: CssBlock): boolean => block.kind === 'rule' && squash(block.prelude) === ':root';

/** Custom properties set by `:root` rules at the top level, later rules winning. */
export function rootVariables(nodes: CssBlock[]): Map<string, string> {
  const vars = new Map<string, string>();
  for (const node of nodes) {
    if (!isRoot(node)) continue;
    for (const d of node.declarations) vars.set(d.prop, d.value);
  }
  return vars;
}

/** Splits a `font-family` list into bare family names. */
export function fontFamilies(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** Expands `#abc` to `#aabbcc`, lower-cases, and drops a fully opaque alpha. */
export function normalizeHex(hex: string): string {
  let h = hex.trim().toLowerCase().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (h.length === 8 && h.endsWith('ff')) h = h.slice(0, 6);
  return `#${h}`;
}
