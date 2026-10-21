import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

describe('the image generation codecs', () => {
  it('decodes a local SVG to raw alpha pixels and PNG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect x="2" y="2" width="4" height="4" fill="#244466"/></svg>');
    const { data, info } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([8, 8, 4]);
    expect([...data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    const center = (3 * info.width + 3) * info.channels;
    expect([...data.subarray(center, center + 4)]).toEqual([36, 68, 102, 255]);
    const png = await sharp(svg).png().toBuffer();
    const metadata = await sharp(png).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual(['png', 8, 8]);
  });

  it('decodes and resizes WebP while preserving transparency', async () => {
    const source = await sharp({
      create: { width: 16, height: 8, channels: 4, background: { r: 36, g: 68, b: 102, alpha: 0.5 } },
    }).webp({ lossless: true }).toBuffer();
    const resized = await sharp(source).resize({ width: 8 }).webp({ lossless: true }).toBuffer();
    const metadata = await sharp(resized).metadata();
    expect([metadata.format, metadata.width, metadata.height, metadata.hasAlpha]).toEqual(['webp', 8, 4, true]);
    const { data, info } = await sharp(resized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBeGreaterThanOrEqual(127);
    expect(data[3]).toBeLessThanOrEqual(128);
  });
});
