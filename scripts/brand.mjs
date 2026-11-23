// `npm run brand`: renders every icon from brand/rewind-mark.svg (one symbol, one colour) with the installed
// Playwright browser, and packs favicon.ico from PNG frames. Real PNGs; no new dependency.
//   public/              website favicons (served on every route)
//   brand/submission/    hackathon submission artwork, kept apart from the site
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const MARK = readFileSync('brand/rewind-mark.svg', 'utf8');
const inner = MARK.replace(/^[\s\S]*?<g /, '<g ').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
const PURPLE = /fill="(#[0-9A-F]{6})"/i.exec(MARK)[1];
// Favicons: a violet tile (the mark's own purple) with the mark in the site's near-black, 5.4:1 against it.
const TILE = PURPLE;
const ON_TILE = '#09090B';
const tileInner = inner.split(PURPLE).join(ON_TILE);

/** The mark on a near-black rounded tile (website favicon). `round` = false for Apple, which rounds the icon itself. */
const tile = (round = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${round ? 22 : 0}" fill="${TILE}"/>
  <g transform="translate(50 50) scale(0.74) translate(-50 -50)">${tileInner}</g>
</svg>`;

mkdirSync('public', { recursive: true });
mkdirSync('brand/submission', { recursive: true });
writeFileSync('public/favicon.svg', tile() + '\n');

const browser = await chromium.launch(process.env.CHANNEL === '' ? {} : { channel: process.env.CHANNEL ?? 'chrome' });
async function png(svg, w, h, transparent) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`);
  const buf = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  return buf;
}

const out = {};
for (const s of [16, 32, 48]) out[`favicon-${s}`] = await png(tile(), s, s, true);
writeFileSync('public/favicon-16x16.png', out['favicon-16']);
writeFileSync('public/favicon-32x32.png', out['favicon-32']);
writeFileSync('public/apple-touch-icon.png', await png(tile(false), 180, 180, false));

// favicon.ico: an ICONDIR with PNG-compressed frames (supported by every current browser and Windows Vista+)
const frames = [16, 32, 48].map((s) => [s, out[`favicon-${s}`]]);
const head = Buffer.alloc(6 + 16 * frames.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
let offset = head.length;
frames.forEach(([s, buf], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s === 256 ? 0 : s, e); head.writeUInt8(s === 256 ? 0 : s, e + 1);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
writeFileSync('public/favicon.ico', Buffer.concat([head, ...frames.map(([, b]) => b)]));

// Submission artwork: the same mark, centred on pure black, generous negative space.
const W = 2560, H = 1440;
const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>
  <g transform="translate(${W / 2} ${H / 2}) scale(${H * 0.42 / 100}) translate(-50 -50)">${inner}</g>
</svg>`;
writeFileSync(`brand/submission/rewind-submission-${W}x${H}.png`, await png(art, W, H, false));
await browser.close();

// Self-check: every PNG is a real PNG of the stated size; the ICO lists 16/32/48 PNG frames.
const dims = (b) => (b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null);
const expect = { 'public/favicon-16x16.png': [16, 16], 'public/favicon-32x32.png': [32, 32], 'public/apple-touch-icon.png': [180, 180], [`brand/submission/rewind-submission-${W}x${H}.png`]: [W, H] };
for (const [f, d] of Object.entries(expect)) {
  const got = dims(readFileSync(f));
  if (!got || got[0] !== d[0] || got[1] !== d[1]) throw new Error(`${f}: expected a ${d.join('x')} PNG, got ${got}`);
  console.log(`ok  ${f}  PNG ${got.join('x')}`);
}
const ico = readFileSync('public/favicon.ico');
const n = ico.readUInt16LE(4);
const sizes = Array.from({ length: n }, (_, i) => ico.readUInt8(6 + 16 * i));
if (ico.readUInt16LE(2) !== 1 || sizes.join() !== '16,32,48') throw new Error(`favicon.ico: frames ${sizes}`);
for (let i = 0; i < n; i++) if (!dims(ico.subarray(ico.readUInt32LE(6 + 16 * i + 12)))) throw new Error('favicon.ico: frame is not PNG');
console.log(`ok  public/favicon.ico  ICO ${sizes.join(', ')} (PNG frames)`);
console.log(`favicons: ${ON_TILE} mark on a ${TILE} tile · submission: ${PURPLE} mark on #000000`);
