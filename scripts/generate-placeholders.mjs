#!/usr/bin/env node
/**
 * Generates neutral placeholder imagery: flat-tone architectural compositions
 * (no gradients, no photos, no third-party material). Output is owned by us and
 * must be captioned "Representative image" wherever it is used.
 *
 * Usage: node scripts/generate-placeholders.mjs <output.png> [seed] [width] [height]
 */
import sharp from "sharp";

const [out, seedArg = "86", wArg = "2400", hArg = "1350"] = process.argv.slice(2);
if (!out) {
  console.error(
    "Usage: node scripts/generate-placeholders.mjs <output.png> [seed] [width] [height]",
  );
  process.exit(1);
}
const W = Number(wArg);
const H = Number(hArg);

// Deterministic PRNG (mulberry32) so the same seed always produces the same image.
let s = Number(seedArg) >>> 0;
const rand = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);

const SKY = "#2B2722";
const HAZE = "#36312A";
const FAR = "#3F3931";
const MID = "#4B443A";
const NEAR = "#1E1B17";
const GROUND = "#171512";
const LIT = "#C9A26B";
const SUN = "#8C6A3F";

const horizon = H * 0.78;
const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="${SKY}"/>`);
// Low sun disc and a haze band: flat shapes, no gradients.
parts.push(
  `<circle cx="${W * 0.7}" cy="${horizon - H * 0.2}" r="${H * 0.09}" fill="${SUN}" opacity="0.55"/>`,
);
parts.push(`<rect y="${horizon - H * 0.16}" width="${W}" height="${H * 0.16}" fill="${HAZE}"/>`);

// Far skyline: many thin, low-contrast towers.
for (let x = -20; x < W;) {
  const w = between(W * 0.018, W * 0.045);
  const h = between(H * 0.12, H * 0.32);
  parts.push(
    `<rect x="${x.toFixed(1)}" y="${(horizon - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${FAR}"/>`,
  );
  x += w + between(2, W * 0.012);
}

// Mid towers.
for (let x = W * 0.02; x < W;) {
  const w = between(W * 0.05, W * 0.08);
  const h = between(H * 0.25, H * 0.42);
  parts.push(
    `<rect x="${x.toFixed(1)}" y="${(horizon - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${MID}"/>`,
  );
  x += w + between(W * 0.03, W * 0.09);
}

// Near towers with lit window grids.
const near = [
  [0.06, 0.1, 0.56],
  [0.19, 0.08, 0.66],
  [0.5, 0.11, 0.6],
  [0.78, 0.09, 0.7],
];
for (const [fx, fw, fh] of near) {
  const x = W * fx;
  const w = W * fw;
  const h = H * fh;
  const top = horizon - h;
  parts.push(`<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${NEAR}"/>`);
  // Crown: a thin parapet line for an architectural read.
  parts.push(`<rect x="${x - 6}" y="${top - 6}" width="${w + 12}" height="6" fill="${NEAR}"/>`);
  const cols = 5;
  const rows = Math.floor(h / (H * 0.035));
  const cw = w / (cols * 2 + 1);
  const rh = h / (rows * 2 + 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rand() > 0.28) continue;
      const wx = x + cw * (c * 2 + 1);
      const wy = top + rh * (r * 2 + 1);
      parts.push(
        `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${cw.toFixed(1)}" height="${(rh * 0.9).toFixed(1)}" fill="${LIT}" opacity="${between(0.55, 0.95).toFixed(2)}"/>`,
      );
    }
  }
}

// Ground plane and a road line.
parts.push(`<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="${GROUND}"/>`);
parts.push(
  `<rect y="${horizon + (H - horizon) * 0.45}" width="${W}" height="3" fill="${SUN}" opacity="0.35"/>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(out);
console.log(`Wrote ${out} (${W}x${H}, seed ${seedArg})`);
