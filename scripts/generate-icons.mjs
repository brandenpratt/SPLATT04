#!/usr/bin/env node
/**
 * Generates the PWA icons locally: a paint-splat mark with "S04" on it.
 *
 * Writes real PNGs using only `node:zlib`, so there is no image dependency and no
 * remote asset to fetch. Deterministic — the same bytes every run.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', 'apps', 'web', 'public', 'icons');

const BACKGROUND = [10, 20, 36, 255];
const SPLAT = [18, 226, 240, 255];
const SPLAT_ALT = [255, 47, 164, 255];
const INK = [200, 255, 47, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  // Each scanline is prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Deterministic wobbly blob, so the mark reads as a paint splat rather than a circle. */
function splatRadius(angle, base, seed) {
  let r = base;
  r += Math.sin(angle * 3 + seed) * base * 0.16;
  r += Math.sin(angle * 7 + seed * 2.3) * base * 0.09;
  r += Math.sin(angle * 11 + seed * 0.7) * base * 0.05;
  return r;
}

function drawIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  // Maskable icons need their content inside the safe zone (80% of the canvas).
  const base = size * (maskable ? 0.3 : 0.38);

  const put = (x, y, colour) => {
    const offset = (y * size + x) * 4;
    rgba[offset] = colour[0];
    rgba[offset + 1] = colour[1];
    rgba[offset + 2] = colour[2];
    rgba[offset + 3] = colour[3];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      put(x, y, BACKGROUND);
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      if (dist <= splatRadius(angle, base * 1.12, 1.7)) put(x, y, SPLAT_ALT);
      if (dist <= splatRadius(angle, base, 0.4)) put(x, y, SPLAT);
    }
  }

  // Satellite droplets.
  for (const [angle, spread, radius] of [
    [0.6, 1.35, 0.09],
    [2.4, 1.5, 0.06],
    [4.1, 1.42, 0.075],
    [5.4, 1.3, 0.05],
  ]) {
    const px = cx + Math.cos(angle) * base * spread;
    const py = cy + Math.sin(angle) * base * spread;
    const r = size * radius;
    for (let y = Math.max(0, Math.floor(py - r)); y < Math.min(size, Math.ceil(py + r)); y++) {
      for (let x = Math.max(0, Math.floor(px - r)); x < Math.min(size, Math.ceil(px + r)); x++) {
        if (Math.hypot(x - px, y - py) <= r) put(x, y, SPLAT);
      }
    }
  }

  drawText(size, put, cx, cy, base);
  return encodePng(size, size, rgba);
}

/** "S04" drawn from a tiny 5x7 bitmap font — no font files involved. */
const GLYPHS = {
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
};

function drawText(size, put, cx, cy, base) {
  const text = 'S04';
  const pixel = Math.max(1, Math.round(base * 0.13));
  const glyphWidth = 5 * pixel;
  const gap = pixel;
  const totalWidth = text.length * glyphWidth + (text.length - 1) * gap;
  let startX = Math.round(cx - totalWidth / 2);
  const startY = Math.round(cy - (7 * pixel) / 2);

  for (const char of text) {
    const glyph = GLYPHS[char];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== '1') continue;
        for (let py = 0; py < pixel; py++) {
          for (let px = 0; px < pixel; px++) {
            const x = startX + col * pixel + px;
            const y = startY + row * pixel + py;
            if (x >= 0 && y >= 0 && x < size && y < size) put(x, y, INK);
          }
        }
      }
    }
    startX += glyphWidth + gap;
  }
}

mkdirSync(outputDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'favicon-64.png', size: 64, maskable: false },
];

for (const target of targets) {
  writeFileSync(join(outputDir, target.name), drawIcon(target.size, target.maskable));
  console.log(`icons: wrote ${target.name} (${target.size}x${target.size})`);
}
