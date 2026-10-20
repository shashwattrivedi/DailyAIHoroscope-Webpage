// Daily build for Cloudflare Pages: copies the site into dist/ and writes the newest
// date's lines into the HTML, so crawlers and link previews see them without running
// any JavaScript. Also writes one page per sign (/aries … /pisces) and a sitemap.
//
//   node scripts/build.mjs [YYYY-MM-DD]
//
// Visitors still get their own local date: the pages swap to it on load if it differs.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://dailyaihoroscope.com').replace(/\/$/, '');
const COPY = ['css', 'js', 'media'];

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, text) => fs.writeFileSync(path.join(OUT, f), text);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

// SIGNS, signIndex and dataKey come from the same file the pages use.
const ctx = {};
vm.runInNewContext(read('js/signs.js') + '\nthis.SIGNS = SIGNS; this.signIndex = signIndex; this.dataKey = dataKey;', ctx);
const { SIGNS, signIndex, dataKey } = ctx;
const slug = (s) => s.name.toLowerCase();

// The newest date that has started (00:00 in UTC+14); fall back a day if it isn't ready.
async function lines(date) {
  const api = read('index.html').match(/name="horoscope-api" content="([^"]+)"/)[1];
  for (const d of date ? [date] : [ymd(Date.now() + 14 * 3600000), ymd(Date.now() - 10 * 3600000)]) {
    try {
      const res = await fetch(api + '/v1/horoscope?date=' + d);
      if (res.ok) return { date: d, signs: (await res.json()).signs };
      console.warn('No lines for ' + d + ': HTTP ' + res.status);
    } catch (e) {
      console.warn('No lines for ' + d + ': ' + e.message);
    }
  }
  return null;
}

function replace(html, find, to) {
  if (!html.includes(find)) throw new Error('Template changed, cannot find: ' + find);
  return html.replace(find, to);
}

function setMeta(html, { title, description, url }) {
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
  html = html.replace(/(<meta name="description" content=")[^"]*/, '$1' + esc(description));
  html = html.replace(/\s*<meta property="og:(title|description|type)"[^>]*>/g, '');
  html = html.replace(/(<meta name="description"[^>]*>)/, '$1\n  <link rel="canonical" href="' + url + '" />' +
    '\n  <meta property="og:title" content="' + esc(title) + '" />\n  <meta property="og:description" content="' + esc(description) + '" />' +
    '\n  <meta property="og:url" content="' + url + '" />\n  <meta property="og:type" content="website" />\n  <meta name="twitter:card" content="summary" />');
  // Pages serves /purpose and / without the .html.
  return html.replace(/href="index\.html"/g, 'href="/"').replace(/href="purpose\.html"/g, 'href="/purpose"');
}

const bakedScript = (day) => '<script id="baked" type="application/json">' + JSON.stringify(day).replace(/</g, '\\u003c') + '</script>\n  ';

function signPage(template, day, i, url, title, description) {
  const s = SIGNS[i];
  let html = setMeta(template, { title, description, url });
  html = replace(html, '<div class="app" id="app">', '<div class="app" id="app" data-sign="' + s.key + '" style="--bg: ' + s.color + '">');
  html = html.replace(/(<meta name="theme-color" content=")[^"]*/, '$1' + s.color);
  html = replace(html, '<span class="mono born" id="born"></span>', '<span class="mono born" id="born">BORN ' + s.dates + '</span>');
  html = replace(html, '<h1 id="signName"></h1>', '<h1 id="signName">' + s.name + '</h1>');
  if (day) {
    html = replace(html, '<blockquote class="quote layer" id="quote"></blockquote>', '<blockquote class="quote layer" id="quote">“' + esc(day.signs[dataKey(s)]) + '”</blockquote>');
    html = replace(html, '<script src="js/astronomy.browser.min.js">', bakedScript(day) + '<script src="js/astronomy.browser.min.js">');
  }
  return html;
}

const day = await lines(process.argv[2]);
if (!day) console.warn('Building without lines; pages will load them in the browser.');
const shown = day ? new Date(day.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'today';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const dir of COPY) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });

const index = read('index.html');
const [, m, d] = (day ? day.date : ymd(Date.now())).split('-').map(Number);

// Home: the sign of the season, like the page picks for a first visit.
write('index.html', signPage(index, day, signIndex(m, d), SITE + '/', 'Daily AI Horoscope · All 12 signs, written by AI',
  'Twelve horoscope-sounding lines written by an AI every day. No astrology. Does yours still feel true?'));

SIGNS.forEach((s, i) => {
  const line = day ? day.signs[dataKey(s)] : '';
  write(slug(s) + '.html', signPage(index, day, i, SITE + '/' + slug(s), s.name + ' horoscope today · Daily AI Horoscope',
    line ? s.name + ', ' + shown + ': “' + line + '” Written by AI, not the stars.' : 'Today’s ' + s.name + ' horoscope, written by an AI. No astrology. Does it still feel true?'));
});

let purpose = setMeta(read('purpose.html'), { title: 'Why it feels true · Daily AI Horoscope', url: SITE + '/purpose',
  description: read('purpose.html').match(/name="description" content="([^"]*)"/)[1] });
if (day) {
  const buttons = SIGNS.map((s) => '<button type="button" class="line" style="--c: ' + s.color + '" aria-pressed="false"><span class="line-sign">' +
    s.glyph + ' ' + s.name.toUpperCase() + '</span><span class="line-text">' + esc(day.signs[dataKey(s)]) + '</span></button>').join('');
  purpose = replace(purpose, '<div class="lines" id="lines"></div>', '<div class="lines" id="lines">' + buttons + '</div>');
  purpose = replace(purpose, '<script src="js/signs.js">', bakedScript(day) + '<script src="js/signs.js">');
}
write('purpose.html', purpose);

const lastmod = day ? day.date : ymd(Date.now());
const urls = ['/', '/purpose', ...SIGNS.map((s) => '/' + slug(s))];
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + SITE + (u === '/' ? '/' : u) + '</loc><lastmod>' + lastmod + '</lastmod><changefreq>daily</changefreq></url>').join('\n') + '\n</urlset>\n');
write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
// Keep the pages.dev copies out of search results; the real address is SITE.
write('_headers', 'https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n\nhttps://:version.:project.pages.dev/*\n  X-Robots-Tag: noindex\n');

console.log('Built dist/ for ' + (day ? day.date : 'no date') + ' (' + (urls.length) + ' pages)');
