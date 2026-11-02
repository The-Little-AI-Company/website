import { NodeType, type HTMLElement, type Node, type TextNode } from 'node-html-parser';

/** Elements whose content is never visible text. */
const NEVER_TEXT = new Set(['script', 'style', 'template', 'head', 'noscript', 'svg', 'title']);

/** Elements that flow inside a line. Everything else breaks the text into a new block. */
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'button', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'img', 'kbd', 'label',
  'mark', 'picture', 'q', 's', 'samp', 'small', 'source', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);

/** Collapses every run of whitespace (including non-breaking spaces) to one space and drops soft hyphens and zero-width spaces. */
export function collapse(text: string): string {
  return text
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
}

const isElement = (node: Node): node is HTMLElement => node.nodeType === NodeType.ELEMENT_NODE;
const isText = (node: Node): node is TextNode => node.nodeType === NodeType.TEXT_NODE;

function isHidden(el: HTMLElement): boolean {
  return el.hasAttribute('hidden');
}

/**
 * The visible text under `root`, one entry per block-level run. Entities are decoded,
 * whitespace is collapsed, and `<script>`, `<style>`, `<template>`, `<svg>`, `<head>`
 * and `[hidden]` are dropped. Inline tags do not add spaces: `a<b>b</b>` reads `ab`,
 * as it does in a browser.
 */
export function textBlocks(root: HTMLElement): string[] {
  const blocks: string[] = [];
  let line = '';
  const flush = (): void => {
    const text = collapse(line);
    if (text) blocks.push(text);
    line = '';
  };
  const visit = (node: Node): void => {
    if (isText(node)) {
      line += node.text;
      return;
    }
    if (!isElement(node)) return;
    const tag = node.rawTagName.toLowerCase();
    if (NEVER_TEXT.has(tag) || isHidden(node)) return;
    if (tag === 'br') {
      flush();
      return;
    }
    const block = !INLINE.has(tag);
    if (block) flush();
    for (const child of node.childNodes) visit(child);
    if (block) flush();
  };
  for (const child of root.childNodes) visit(child);
  flush();
  return blocks;
}

/** All visible text under `root` on one line. */
export function visibleText(root: HTMLElement): string {
  return textBlocks(root).join(' ');
}

/** The text of one element, the way a visitor reads it. Quotes and apostrophes are compared as they are typed: curly. */
export function textOf(el: HTMLElement): string {
  return visibleText(el);
}
