// Renders the favicons and app icons from the pixel mark in src/data/mark.ts: the mark in pink, at a
// whole number of device pixels per mark pixel so the blocks stay sharp. The tab icons are transparent.
// The app icons are opaque squares of paper, because iOS fills transparent pixels with black.
// Run it with `pnpm icons`. Node strips the types from mark.ts when it imports it.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { markPath } from '../src/data/mark.ts';

const PINK = '#FF48B0';
const PAPER = '#F1F0EB';
const out = (file) => fileURLToPath(new URL(`../public/${file}`, import.meta.url));

/** The mark at `scale` px per mark pixel, centered on a `size` px square, on `ground` or transparent. */
function svg(size, scale, ground) {
  const x = Math.floor((size - 10 * scale) / 2);
  const y = Math.floor((size - 11 * scale) / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    (ground ? `<rect width="${size}" height="${size}" fill="${ground}"/>` : '') +
    `<path transform="translate(${x} ${y}) scale(${scale})" fill="${PINK}" d="${markPath}"/></svg>`
  );
}

const png = (size, scale, ground) => sharp(Buffer.from(svg(size, scale, ground))).png().toBuffer();

writeFileSync(out('favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 0 12 11" shape-rendering="crispEdges"><path fill="${PINK}" d="${markPath}"/></svg>\n`);

const tab = { 16: await png(16, 1), 32: await png(32, 2) };
writeFileSync(out('favicon-16.png'), tab[16]);
writeFileSync(out('favicon-32.png'), tab[32]);

// An ICO file is a directory of images. Modern ICO readers take PNG payloads as they are.
const entries = [[16, tab[16]], [32, tab[32]]];
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach(([size, data], i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size, at);
  header.writeUInt8(size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(data.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += data.length;
});
writeFileSync(out('favicon.ico'), Buffer.concat([header, ...entries.map(([, data]) => data)]));

for (const [file, size, scale] of [['apple-touch-icon.png', 180, 12], ['icon-192.png', 192, 12], ['icon-512.png', 512, 28]]) {
  const data = await sharp(await png(size, scale, PAPER)).flatten({ background: PAPER }).png().toBuffer();
  writeFileSync(out(file), data);
}
console.log('wrote favicon.svg, favicon.ico, favicon-16.png, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png');
