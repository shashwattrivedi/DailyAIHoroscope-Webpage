// Draws the brand files in media/brand/ from the one mark (SATURN in js/signs.js), so
// the favicon, the phone icons and the logo never drift from the site and the images.
// Run it after changing the mark or the colours, and commit the results:
//
//   node scripts/brand.mjs
//
//   saturn.svg              the mark alone, black on transparent
//   logo.svg, logo-white.svg the mark and "Daily AI Horoscope" (Outfit 800, embedded),
//                           black for light backgrounds, white for dark ones
//   favicon.svg             browser tab: the mark on pink, rounded square
//   favicon.ico             16, 32 and 48 px, for old browsers and /favicon.ico
//   apple-touch-icon.png    180 px, iPhone home screen (iOS rounds the corners)
//   icon-192.png, icon-512.png  Android and the web app manifest (safe for round masks)
//
// The social avatars and headers (avatar-*.png, header-*, cover-*, reddit-banner-*) were
// drawn with the same mark and pink; see BRAND.md.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'media', 'brand');
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'signs.js'), 'utf8') + '\nthis.SATURN = SATURN;', ctx);
const { SATURN } = ctx;

const PINK = '#FF6BB5', INK = '#111111';
const stroke = (width, color) => 'fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"';
// The mark centred in a size × size square: height share of the square, stroke in path units.
const centred = (size, share, width, color) => {
  const k = size * share / 565;
  return '<path transform="translate(' + (size / 2 - 402.5 * k).toFixed(2) + ' ' + (size / 2 - 412.5 * k).toFixed(2) + ') scale(' + k.toFixed(5) + ')" d="' + SATURN.d + '" ' + stroke(width, color) + '/>';
};
const square = (size, body, radius = 0) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
  '<rect width="' + size + '" height="' + size + '" rx="' + radius + '" fill="' + PINK + '"/>' + body + '</svg>';

const files = {};
files['saturn.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + SATURN.box + '"><path d="' + SATURN.d + '" ' + stroke(60, INK) + '/></svg>\n';
// Small sizes get a heavier stroke so the mark stays readable at 16 px.
files['favicon.svg'] = square(64, centred(64, 0.72, 78, INK), 14) + '\n';
const icon = (size) => square(size, centred(size, size < 100 ? 0.72 : 0.62, size < 100 ? 78 : 70, INK));

const font = fs.readFileSync(path.join(ROOT, 'fonts', 'outfit-latin.woff2')).toString('base64');
const logo = (color) => {
  const [bx, by, bw, bh] = SATURN.box.split(' ').map(Number), k = 120 / bh;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="120" viewBox="0 0 760 120">' +
    '<style>@font-face{font-family:Outfit;font-weight:800;src:url(data:font/woff2;base64,' + font + ') format("woff2")}</style>' +
    '<path transform="translate(' + (-bx * k).toFixed(2) + ' ' + (-by * k).toFixed(2) + ') scale(' + k.toFixed(5) + ')" d="' + SATURN.d + '" ' + stroke(60, color) + '/>' +
    '<text x="' + Math.round(bw * k + 22) + '" y="86" font-family="Outfit, sans-serif" font-weight="800" font-size="70" letter-spacing="-0.7" fill="' + color + '">Daily AI Horoscope</text></svg>\n';
};
files['logo.svg'] = logo(INK);
files['logo-white.svg'] = logo('#FFFFFF');
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), text);

// PNGs: headless Chrome draws each SVG at its exact size.
const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && fs.existsSync(p));
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
const png = async (svg, size) => {
  await page.setViewport({ width: size, height: size });
  await page.setContent('<style>html,body{margin:0;background:transparent}</style>' + svg);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
};
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await png(icon(180), 180));
fs.writeFileSync(path.join(OUT, 'icon-192.png'), await png(icon(192), 192));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), await png(icon(512), 512));
// favicon.ico: an ICO header and directory, then each size as a PNG.
const tab = await Promise.all([16, 32, 48].map(async (s) => [s, await png(square(s, centred(s, 0.72, 78, INK), Math.round(s * 0.22)), s)]));
const head = Buffer.alloc(6 + 16 * tab.length);
head.writeUInt16LE(1, 2); head.writeUInt16LE(tab.length, 4);
let offset = head.length;
tab.forEach(([s, data], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([head, ...tab.map(([, d]) => d)]));
await browser.close();
console.log('Wrote media/brand/: ' + [...Object.keys(files), 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'favicon.ico'].join(', '));
