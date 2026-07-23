// Generates solid-color PNG icons for the PWA manifest without needing an
// image-processing dependency. Draws the brand red square with the same
// clipped-corner mark used in the sidebar, on a dark background.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const RED = [225, 6, 0];
const BG = [10, 10, 12];

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function makeIcon(size, { padding = 0.16 } = {}) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const pad = Math.round(size * padding);
  const markSize = size - pad * 2;
  // Pentagon-ish clip (matches .brand-mark clip-path) approximated per-pixel.
  const cut = markSize * 0.35;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const px = x - pad, py = y - pad;
      let inMark = px >= 0 && py >= 0 && px < markSize && py < markSize;
      if (inMark) {
        // clip bottom-right corner diagonally (polygon 0 0,100% 0,100% 65%,65% 100%,0 100%)
        const cutStartX = markSize * 0.65;
        const cutStartY = markSize * 0.65;
        if (px > cutStartX && py > cutStartY) {
          // diagonal cut between (cutStartX, markSize) and (markSize, cutStartY)
          const t = (px - cutStartX) / (markSize - cutStartX);
          const boundaryY = markSize - t * (markSize - cutStartY);
          if (py > boundaryY) inMark = false;
        }
      }
      const [r, g, b] = inMark ? RED : BG;
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'maskable-512.png', size: 512, padding: 0.28 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const t of targets) {
  fs.writeFileSync(path.join(outDir, t.name), makeIcon(t.size, { padding: t.padding }));
  console.log('wrote', t.name);
}
