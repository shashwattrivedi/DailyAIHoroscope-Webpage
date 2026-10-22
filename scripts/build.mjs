// Daily build for Cloudflare Pages: copies the site into dist/ and writes the newest
// date's lines into the HTML, so crawlers and link previews see them without running
// any JavaScript. Also writes one page per sign (/aries … /pisces), a link-preview
// image per sign (drawn by scripts/og.html in headless Chrome), the embeddable widget
// (/widget, /embed), RSS feeds (/feed.xml, /feed/<sign>.xml) and a sitemap.
//
//   node scripts/build.mjs [YYYY-MM-DD]
//
// Visitors still get their own local date: the pages swap to it on load if it differs.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://dailyaihoroscope.com').replace(/\/$/, '');
const COPY = ['css', 'js', 'media', 'fonts'];

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, text) => fs.writeFileSync(path.join(OUT, f), text);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

// SIGNS, signIndex and dataKey come from the same file the pages use.
const ctx = {};
vm.runInNewContext(read('js/signs.js') + '\nthis.SIGNS = SIGNS; this.signIndex = signIndex; this.dataKey = dataKey;', ctx);
const { SIGNS, signIndex, dataKey } = ctx;
const slug = (s) => s.name.toLowerCase();

// Every date that is "today" somewhere on Earth (UTC-12 to UTC+14: two or three dates),
// newest first, so every visitor finds their own date baked into the page until the
// next daily build. Only the given date when one is passed.
async function lines(date) {
  const api = read('index.html').match(/name="horoscope-api" content="([^"]+)"/)[1];
  const dates = [];
  if (date) dates.push(date);
  else for (let t = Date.now() + 14 * 3600000; ymd(t) >= ymd(Date.now() - 12 * 3600000); t -= 86400000) dates.push(ymd(t));
  const out = [];
  for (const d of dates) {
    try {
      const res = await fetch(api + '/v1/horoscope?date=' + d);
      if (res.ok) out.push({ date: d, signs: (await res.json()).signs });
      else console.warn('No lines for ' + d + ': HTTP ' + res.status);
    } catch (e) {
      console.warn('No lines for ' + d + ': ' + e.message);
    }
  }
  return out;
}

// The week before the baked dates, for the RSS feeds: the Worker's public files.
async function olderLines(newest, count) {
  const data = read('index.html').match(/name="horoscope-data" content="([^"]+)"/)[1], out = [];
  for (let i = 1; out.length < count && i <= count + 3; i++) {
    const d = ymd(Date.parse(newest) - i * 86400000);
    try {
      const res = await fetch(data + '/data/' + d + '.json');
      if (res.ok) out.push({ date: d, signs: (await res.json()).signs });
    } catch (e) {}
  }
  return out;
}

function replace(html, find, to) {
  if (!html.includes(find)) throw new Error('Template changed, cannot find: ' + find);
  return html.replace(find, to);
}

// image: { url, alt } or null; ld: structured data (JSON-LD) objects; feed: the page's
// own RSS feed, if it has one besides the one for all signs.
function setMeta(html, { title, description, url, image, ld = [], feed }) {
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
  html = html.replace(/(<meta name="description" content=")[^"]*/, '$1' + esc(description));
  html = html.replace(/\s*<meta property="og:(title|description|type)"[^>]*>/g, '');
  const tags = [
    '<link rel="canonical" href="' + url + '" />',
    '<meta property="og:site_name" content="Daily AI Horoscope" />',
    '<meta property="og:title" content="' + esc(title) + '" />',
    '<meta property="og:description" content="' + esc(description) + '" />',
    '<meta property="og:url" content="' + url + '" />',
    '<meta property="og:type" content="website" />',
    ...(image ? [
      '<meta property="og:image" content="' + image.url + '" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta property="og:image:alt" content="' + esc(image.alt) + '" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:image" content="' + image.url + '" />'
    ] : ['<meta name="twitter:card" content="summary" />']),
    '<meta name="twitter:title" content="' + esc(title) + '" />',
    '<meta name="twitter:description" content="' + esc(description) + '" />',
    '<link rel="alternate" type="application/rss+xml" title="Daily AI Horoscope: all 12 signs" href="' + SITE + '/feed.xml" />',
    ...(feed ? ['<link rel="alternate" type="application/rss+xml" title="' + esc(feed.title) + '" href="' + feed.url + '" />'] : []),
    ...ld.map((o) => '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c') + '</script>')
  ];
  html = html.replace(/(<meta name="description"[^>]*>)/, () => html.match(/<meta name="description"[^>]*>/)[0] + '\n  ' + tags.join('\n  '));
  // Pages serves /purpose, /embed and / without the .html.
  return html.replace(/href="index\.html"/g, 'href="/"').replace(/href="(purpose|embed)\.html"/g, 'href="/$1"');
}

// { "YYYY-MM-DD": { Aries: '…', … }, … } for every baked date (see lines()).
const bakedScript = () => '<script id="baked" type="application/json">' + JSON.stringify(baked).replace(/</g, '\\u003c') + '</script>\n  ';

function signPage(template, day, i, meta) {
  const s = SIGNS[i];
  let html = setMeta(template, meta);
  // The sign colour goes on <html>, the one place app.js updates it when the sign changes.
  html = replace(html, '<html lang="en">', '<html lang="en" style="--bg: ' + s.color + '">');
  html = replace(html, '<div class="app" id="app">', '<div class="app" id="app" data-sign="' + s.key + '">');
  html = html.replace(/(<meta name="theme-color" content=")[^"]*/, '$1' + s.color);
  html = replace(html, '<span class="mono born" id="born"></span>', '<span class="mono born" id="born">BORN ' + s.dates + '</span>');
  html = replace(html, '<h1 id="signName"></h1>', '<h1 id="signName">' + s.name + '</h1>');
  if (day) {
    html = replace(html, '<blockquote class="quote layer" id="quote"></blockquote>', '<blockquote class="quote layer" id="quote">“' + esc(day.signs[dataKey(s)]) + '”</blockquote>');
    html = replace(html, '<script src="js/astronomy.browser.min.js">', bakedScript() + '<script src="js/astronomy.browser.min.js">');
  }
  return html;
}

// Draws og/<sign>-<date>.png (link previews), post/<sign>-<date>.jpg (Instagram and
// Bluesky, posted by the Worker) and story/<sign>-<date>.jpg (Instagram stories) for
// every sign. The date is in the file name because platforms
// cache images by URL. Returns false if Chrome isn't available.
async function drawImages(date, lineOf) {
  const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && fs.existsSync(p));
  let puppeteer;
  try { puppeteer = (await import('puppeteer-core')).default; } catch (e) {}
  if (!chrome || !puppeteer) { console.warn('No Chrome or puppeteer-core (run npm install); skipping preview images.'); return false; }
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'scripts', 'og.html')).href, { waitUntil: 'networkidle0' });
    fs.mkdirSync(path.join(OUT, 'og'));
    fs.mkdirSync(path.join(OUT, 'post'));
    fs.mkdirSync(path.join(OUT, 'story'));
    const label = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '').toUpperCase();
    for (const s of SIGNS) {
      for (const [layout, dir, ext] of [['og', 'og', 'png'], ['post', 'post', 'jpg'], ['story', 'story', 'jpg']]) {
        // A story can't carry a link, so it shows the sign's own address.
        const site = SITE.replace(/^https?:\/\//, '') + (layout === 'story' ? '/' + slug(s) : '');
        const img = await page.evaluate((...a) => window.drawCard(...a), layout, s.key, label, lineOf(s), site);
        fs.writeFileSync(path.join(OUT, dir, slug(s) + '-' + date + '.' + ext), Buffer.from(img.split(',')[1], 'base64'));
      }
    }
    // First slide of the Instagram carousel, in the colour of the sign of the season.
    const [, m, d] = date.split('-').map(Number);
    const cover = await page.evaluate((...a) => window.drawCover(...a), SIGNS[signIndex(m, d)].key, label, SITE.replace(/^https?:\/\//, ''));
    fs.writeFileSync(path.join(OUT, 'post', 'cover-' + date + '.jpg'), Buffer.from(cover.split(',')[1], 'base64'));
    const storyCover = await page.evaluate((...a) => window.drawCover(...a), SIGNS[signIndex(m, d)].key, label, SITE.replace(/^https?:\/\//, ''), true);
    fs.writeFileSync(path.join(OUT, 'story', 'cover-' + date + '.jpg'), Buffer.from(storyCover.split(',')[1], 'base64'));
    return true;
  } finally {
    await browser.close();
  }
}

// The newest date is "today" for the visible text, meta tags and images.
const days = await lines(process.argv[2]);
const day = days[0] || null;
const baked = Object.fromEntries(days.map((d) => [d.date, d.signs]));
if (!day) console.warn('Building without lines; pages will load them in the browser.');
const date = day ? day.date : ymd(Date.now());
const shown = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const lineOf = (s) => (day ? day.signs[dataKey(s)] : '');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const dir of COPY) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });

const images = await drawImages(date, lineOf);
const imageOf = (s) => images ? { url: SITE + '/og/' + slug(s) + '-' + date + '.png', alt: s.name + ': ' + (lineOf(s) || 'today’s horoscope, written by AI') } : null;

// The site's own accounts. Listing them here (and linking them with rel="me" on the
// purpose page) tells search engines they belong to dailyaihoroscope.com.
const PROFILES = ['https://www.instagram.com/dailyaihoroscope/', 'https://www.facebook.com/dailyaihoroscope',
  'https://bsky.app/profile/dailyaihoroscope.com', 'https://github.com/shashwattrivedi/DailyAIHoroscope-Webpage'];
const ORG = { '@type': 'Organization', name: 'Daily AI Horoscope', url: SITE + '/', logo: SITE + '/media/brand/avatar-400.png', sameAs: PROFILES };
const index = read('index.html');
const [, m, d] = date.split('-').map(Number);
const season = SIGNS[signIndex(m, d)];

// Home: the sign of the season, like the page picks for a first visit.
const homeDescription = 'Twelve horoscope-sounding lines written by an AI every day. No astrology. Does yours still feel true?';
write('index.html', signPage(index, day, signIndex(m, d), {
  title: 'Daily AI Horoscope · All 12 signs, written by AI', description: homeDescription, url: SITE + '/', image: imageOf(season),
  ld: [{ '@type': 'WebSite', name: 'Daily AI Horoscope', url: SITE + '/', description: homeDescription }, ORG]
}));

SIGNS.forEach((s, i) => {
  const line = lineOf(s), url = SITE + '/' + slug(s);
  write(slug(s) + '.html', signPage(index, day, i, {
    title: s.name + ' horoscope today · Daily AI Horoscope', url, image: imageOf(s),
    feed: { title: 'Daily AI Horoscope: ' + s.name, url: SITE + '/feed/' + slug(s) + '.xml' },
    description: line ? s.name + ', ' + shown + ': “' + line + '” Written by AI, not the stars.' : 'Today’s ' + s.name + ' horoscope, written by an AI. No astrology. Does it still feel true?',
    ld: line ? [{
      '@type': 'Article', headline: s.name + ' horoscope for ' + shown, description: line, articleBody: line,
      datePublished: date, dateModified: date, inLanguage: 'en', mainEntityOfPage: url,
      ...(images ? { image: imageOf(s).url } : {}), author: ORG, publisher: ORG
    }] : []
  }));
});

const purposeDescription = read('purpose.html').match(/name="description" content="([^"]*)"/)[1];
let purpose = setMeta(read('purpose.html'), {
  title: 'Why it feels true · Daily AI Horoscope', url: SITE + '/purpose', description: purposeDescription, image: imageOf(season),
  ld: [{
    '@type': 'WebPage', name: 'Why it feels true', url: SITE + '/purpose', description: purposeDescription,
    about: { '@type': 'Thing', name: 'Barnum effect', sameAs: 'https://en.wikipedia.org/wiki/Barnum_effect' },
    isPartOf: { '@type': 'WebSite', name: 'Daily AI Horoscope', url: SITE + '/' }, publisher: ORG
  }]
});
if (day) {
  const buttons = SIGNS.map((s) => '<button type="button" class="line" style="--c: ' + s.color + '" aria-pressed="false"><span class="line-sign">' +
    s.glyph + ' ' + s.name.toUpperCase() + '</span><span class="line-text">' + esc(day.signs[dataKey(s)]) + '</span></button>').join('');
  purpose = replace(purpose, '<div class="lines" id="lines"></div>', '<div class="lines" id="lines">' + buttons + '</div>');
  purpose = replace(purpose, '<script src="js/signs.js">', bakedScript() + '<script src="js/signs.js">');
}
write('purpose.html', purpose);

// The widget (/widget) for other sites' iframes, with the lines baked in like the pages,
// and the page that makes its snippet (/embed).
let widget = read('widget.html');
if (day) widget = replace(widget, '<script src="js/signs.js">', bakedScript() + '<script src="js/signs.js">');
write('widget.html', widget);
const embedDescription = read('embed.html').match(/name="description" content="([^"]*)"/)[1];
write('embed.html', setMeta(read('embed.html'), {
  title: 'Free horoscope widget · Daily AI Horoscope', url: SITE + '/embed', description: embedDescription, image: imageOf(season)
}));

// RSS: every sign's line for the last week, newest first; one feed for all signs and one
// per sign. The line is in the item title too, since start-page widgets often show only that.
const feedDays = day ? [...days, ...(await olderLines(days[days.length - 1].date, Math.max(0, 7 - days.length)))] : [];
const xml = (s) => esc(s).replace(/'/g, '&apos;');
// A date starts at UTC+14, the first timezone to reach it.
const pubDate = (d) => new Date(Date.parse(d + 'T00:00:00+14:00')).toUTCString();
function feed(file, title, description, items) {
  write(file, '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n' +
    '  <title>' + xml(title) + '</title>\n  <link>' + SITE + '/</link>\n  <description>' + xml(description) + '</description>\n' +
    '  <language>en</language>\n  <ttl>360</ttl>\n  <atom:link href="' + SITE + '/' + file + '" rel="self" type="application/rss+xml" />\n' +
    '  <image><url>' + SITE + '/media/brand/avatar-400.png</url><title>' + xml(title) + '</title><link>' + SITE + '/</link></image>\n' +
    (feedDays.length ? '  <lastBuildDate>' + pubDate(feedDays[0].date) + '</lastBuildDate>\n' : '') +
    items.map((it) => '  <item>\n    <title>' + xml(it.title) + '</title>\n    <link>' + it.link + '</link>\n' +
      '    <guid isPermaLink="false">' + it.guid + '</guid>\n    <pubDate>' + it.date + '</pubDate>\n' +
      '    <description>' + xml(it.text) + '</description>\n  </item>\n').join('') +
    '</channel>\n</rss>\n');
}
const items = (d, list) => list.filter((s) => d.signs[dataKey(s)]).map((s) => {
  const short = new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const line = d.signs[dataKey(s)];
  return {
    title: s.name + ', ' + short + ': “' + line + '”', text: '“' + line + '” Written by an AI, not the stars.',
    link: SITE + '/' + slug(s) + '?utm_source=rss&amp;utm_medium=feed', guid: 'dailyaihoroscope-' + slug(s) + '-' + d.date, date: pubDate(d.date)
  };
});
fs.mkdirSync(path.join(OUT, 'feed'));
feed('feed.xml', 'Daily AI Horoscope', 'Twelve horoscope-sounding lines written by an AI every day. No astrology.', feedDays.flatMap((d) => items(d, SIGNS)));
SIGNS.forEach((s) => feed('feed/' + slug(s) + '.xml', 'Daily AI Horoscope: ' + s.name, 'Today’s ' + s.name + ' horoscope, written by an AI every day. No astrology.',
  feedDays.flatMap((d) => items(d, [s]))));

// Every page asks for its CSS and JS by content hash (css/site.css?v=1a2b3c4d5e), so after
// a deploy a browser never pairs new HTML with an old cached file, and an unchanged file
// stays cached.
const hashes = {};
const hashOf = (f) => (hashes[f] ??= crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, f))).digest('hex').slice(0, 10));
for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(OUT, f), 'utf8');
  write(f, html.replace(/((?:href|src)=")((?:css|js)\/[^"?#]+\.(?:css|js))"/g, (m, attr, file) => attr + file + '?v=' + hashOf(file) + '"'));
}

const lastmod = date;
const urls = ['/', '/purpose', '/embed', ...SIGNS.map((s) => '/' + slug(s))];
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + SITE + (u === '/' ? '/' : u) + '</loc><lastmod>' + lastmod + '</lastmod><changefreq>daily</changefreq></url>').join('\n') + '\n</urlset>\n');
write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
// Keep the pages.dev copies out of search results; the real address is SITE.
write('_headers', 'https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n\nhttps://:version.:project.pages.dev/*\n  X-Robots-Tag: noindex\n\n' +
  // The font files never change, so browsers can keep them without asking again.
  '/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n\n' +
  // CSS and JS are versioned by content hash (above); pages are checked on every visit.
  '/css/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/js/*\n  Cache-Control: public, max-age=31536000, immutable\n\n' +
  // Start pages that read the feeds in the browser need CORS.
  '/feed.xml\n  Access-Control-Allow-Origin: *\n\n/feed/*\n  Access-Control-Allow-Origin: *\n');

console.log('Built dist/ for ' + (day ? Object.keys(baked).join(', ') : 'no date') + ' (' + urls.length + ' pages' + (images ? ', 38 images' : '') + ', ' + (SIGNS.length + 1) + ' feeds)');
