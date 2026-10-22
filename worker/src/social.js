// Shares each day's lines on social media, from the Worker's cron (12:00 UTC, retry
// 14:00; after the daily site build has published that day's images).
//
// - Which platforms: the SOCIAL var (comma-separated). A platform also needs its keys.
// - Keys are Worker secrets (`npx wrangler secret put NAME`), never in the repo; for
//   local testing put them in worker/.dev.vars, which git ignores.
// - SOCIAL_DRY_RUN is "true" until you switch it off: posts are only logged.
// - Each post is recorded in KV (posted:<date>:<part>), so a re-run never posts twice
//   and a run that broke halfway continues where it stopped.
// - Platforms run independently; one failing doesn't stop the others.

import { explain } from './ops.js';

const SIGNS = [
  ['Aries', 'Aries', '♈'], ['Taurus', 'Taurus', '♉'], ['Gemini', 'Gemini', '♊'], ['Cancer', 'Cancer', '♋'],
  ['Leo', 'Leo', '♌'], ['Virgo', 'Virgo', '♍'], ['Libra', 'Libra', '♎'], ['Scorpius', 'Scorpio', '♏'],
  ['Sagittarius', 'Sagittarius', '♐'], ['Capricornus', 'Capricorn', '♑'], ['Aquarius', 'Aquarius', '♒'], ['Pisces', 'Pisces', '♓']
].map(([key, name, glyph]) => ({ key, name, glyph, slug: name.toLowerCase() }));

const DISCLAIMER = 'Written by an AI, not an astrologer. It isn’t advice; please don’t follow it.';
const INVITE = 'Felt true? Share it with #DailyAIHoroscopeWasCorrect';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const graphemes = (s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length;

// fetch with retries for network errors, 429 and 5xx (backoff, honours Retry-After).
async function call(what, url, init = {}, tries = 3) {
  for (let i = 1; ; i++) {
    let res, err;
    try { res = await fetch(url, init); } catch (e) { err = e; }
    if (res && res.ok) return res;
    const again = !res || res.status === 429 || res.status >= 500;
    if (!again || i >= tries) {
      const detail = res ? 'HTTP ' + res.status + ' ' + (await res.text()).slice(0, 300) : String(err);
      throw new Error(what + ': ' + detail);
    }
    const wait = Number(res && res.headers.get('retry-after')) * 1000 || 1000 * 2 ** (i - 1);
    await sleep(Math.min(wait, 30000));
  }
}

const form = (fields, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields) });
const jsonPost = (body, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

// Shortens the line until the whole post fits the platform's limit.
function fit(make, line, limit, measure) {
  let l = line;
  while (measure(make(l)) > limit && l.length > 20) l = l.slice(0, l.lastIndexOf(' ', l.length - 2)) + '…';
  return make(l);
}

// ---------- Bluesky (AT Protocol, app password) ----------

// Links and hashtags have to be marked up (by UTF-8 byte offsets) to be clickable.
function facets(text) {
  const enc = new TextEncoder(), at = (i) => enc.encode(text.slice(0, i)).length, out = [];
  for (const m of text.matchAll(/https?:\/\/\S+/g))
    out.push({ index: { byteStart: at(m.index), byteEnd: at(m.index + m[0].length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  for (const m of text.matchAll(/#(\w+)/g))
    out.push({ index: { byteStart: at(m.index), byteEnd: at(m.index + m[0].length) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }] });
  return out;
}

const BLUESKY_GAP = 30000; // ms between sign posts; 12 posts take about 6 minutes

async function bluesky(c) {
  const { env } = c, host = env.BLUESKY_SERVICE || 'https://bsky.social';
  let session;
  const auth = async () => (session ??= await (await call('Bluesky login', host + '/xrpc/com.atproto.server.createSession',
    jsonPost({ identifier: env.BLUESKY_HANDLE.trim().replace(/^@/, ''), password: env.BLUESKY_APP_PASSWORD.trim() }))).json());
  const post = async (record) => {
    const s = await auth();
    return (await call('Bluesky post', host + '/xrpc/com.atproto.repo.createRecord', jsonPost({
      repo: s.did, collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', createdAt: new Date().toISOString(), langs: ['en'], facets: facets(record.text), ...record }
    }, { Authorization: 'Bearer ' + s.accessJwt }))).json();
  };
  const upload = async (url) => {
    const img = await call('Image ' + url, url), s = await auth();
    if (!/^image\//.test(img.headers.get('content-type') || '')) throw new Error('Not an image: ' + url);
    return (await (await call('Bluesky upload', host + '/xrpc/com.atproto.repo.uploadBlob', {
      method: 'POST', headers: { 'Content-Type': img.headers.get('content-type') || 'image/png', Authorization: 'Bearer ' + s.accessJwt }, body: await img.arrayBuffer()
    })).json()).blob;
  };
  // One post per sign (each can be liked, reposted and found on its own), with the tall
  // 4:5 card, a little apart so they don't land in followers' feeds as one block.
  let gap = false;
  for (const s of SIGNS) {
    const text = fit((l) => s.glyph + ' ' + s.name + ' · ' + c.short + '\n\n“' + l + '”\n\nWritten by AI, not the stars. #' + s.name + ' #horoscope\n' +
      c.site + '/' + s.slug, c.line(s), 300, graphemes);
    await c.once('bluesky:' + s.slug, text, async () => {
      if (gap) await sleep(BLUESKY_GAP);
      gap = true;
      return post({
        text,
        embed: { $type: 'app.bsky.embed.images', images: [{ image: await upload(c.image('post', s)), alt: s.name + ': ' + c.line(s), aspectRatio: { width: 1080, height: 1350 } }] }
      });
    });
  }
}

// ---------- X (API v2, OAuth 1.0a user keys) ----------

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());

async function oauth1(env, method, url) {
  const p = {
    oauth_consumer_key: env.X_API_KEY, oauth_nonce: crypto.randomUUID().replace(/-/g, ''), oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: env.X_ACCESS_TOKEN, oauth_version: '1.0'
  };
  const params = Object.keys(p).sort().map((k) => pct(k) + '=' + pct(p[k])).join('&');
  const base = [method, pct(url), pct(params)].join('&');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pct(env.X_API_SECRET) + '&' + pct(env.X_ACCESS_SECRET)), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  p.oauth_signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base)))));
  return 'OAuth ' + Object.keys(p).sort().map((k) => pct(k) + '="' + pct(p[k]) + '"').join(', ');
}

// X counts every link as 23 characters.
const xLength = (t) => graphemes(t.replace(/https?:\/\/\S+/g, 'x'.repeat(23)));

async function x(c) {
  const { env } = c, url = 'https://api.x.com/2/tweets';
  const tweet = async (text, replyTo) => (await (await call('X post', url, jsonPost({ text, ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}) },
    { Authorization: await oauth1(env, 'POST', url) }))).json()).data;

  const rootText = c.rootText;
  const root = await c.once('x:root', rootText, () => tweet(rootText));
  // The free X API tier allows few posts a month; X_THREAD=false posts only the first one.
  if (env.X_THREAD === 'false') return;
  let parent = root;
  for (const s of SIGNS) {
    // The sign page's preview image shows up as the link card.
    const text = fit((l) => s.glyph + ' ' + s.name + ' · ' + c.short + '\n“' + l + '”\n' + c.site + '/' + s.slug, c.line(s), 280, xLength);
    parent = await c.once('x:' + s.slug, text, () => tweet(text, parent.id));
  }
}

// ---------- Facebook Page and Instagram (Meta Graph API, Page access token) ----------

const graph = (env, path) => 'https://graph.facebook.com/' + (env.META_GRAPH_VERSION || 'v23.0') + '/' + path;

async function facebook(c) {
  const { env } = c;
  const message = 'Today’s 12 horoscopes for ' + c.long + ', written by an AI.\n\n' +
    SIGNS.map((s) => s.glyph + ' ' + s.name + ': ' + c.line(s)).join('\n') + '\n\n' + DISCLAIMER + '\n' + INVITE;
  await c.once('facebook', message, async () =>
    (await call('Facebook post', graph(env, env.META_PAGE_ID + '/feed'), form({ message, link: c.site, access_token: env.META_PAGE_TOKEN }))).json());
}

// Instagram fetches each image itself; every image is a container that must finish
// processing before it can be published.
const igMake = async (env, fields) => (await call('Instagram upload', graph(env, env.INSTAGRAM_USER_ID + '/media'),
  form({ ...fields, access_token: env.META_PAGE_TOKEN }))).json();
async function igReady(env, id) {
  for (let i = 0; i < 20; i++) {
    const st = await (await call('Instagram status', graph(env, id) + '?fields=status_code&access_token=' + encodeURIComponent(env.META_PAGE_TOKEN))).json();
    if (st.status_code === 'FINISHED') return;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('Instagram: upload ' + st.status_code);
    await sleep(3000);
  }
  throw new Error('Instagram: upload still processing');
}
const igPublish = async (env, id) => (await call('Instagram publish', graph(env, env.INSTAGRAM_USER_ID + '/media_publish'),
  form({ creation_id: id, access_token: env.META_PAGE_TOKEN }))).json();

// One carousel a day: a cover slide ("swipe to find your sign"), then the 12 sign cards,
// with all 12 lines in the caption.
async function instagram(c) {
  const { env } = c;
  const head = 'Today’s 12 horoscopes for ' + c.long + ', written by an AI. Swipe to find your sign.';
  const tail = '\n\n' + DISCLAIMER + '\nAll 12 signs: ' + c.site.replace(/^https?:\/\//, '') +
    '\n\n' + INVITE + '\n#DailyAIHoroscope #horoscope #zodiac #barnumeffect ' + SIGNS.map((s) => '#' + s.slug).join(' ');
  let caption = head + '\n\n' + SIGNS.map((s) => s.glyph + ' ' + s.name + ': ' + c.line(s)).join('\n') + tail;
  if (caption.length > 2200) caption = head + tail; // Instagram's caption limit

  await c.once('instagram', caption, async () => {
    const slides = [];
    for (const url of [c.image('cover'), ...SIGNS.map((s) => c.image('post', s))]) slides.push((await igMake(env, { image_url: url, is_carousel_item: 'true' })).id);
    for (const id of slides) await igReady(env, id);
    const carousel = await igMake(env, { media_type: 'CAROUSEL', children: slides.join(','), caption });
    await igReady(env, carousel.id);
    return igPublish(env, carousel.id);
  });
}

// 13 stories a day, in zodiac order so they play as a sequence: a cover ("tap to find
// your sign"), then one 9:16 card per sign. If a run stops partway, the next run of the
// same day carries on from the next sign, so the sequence stays in order. A story can't
// carry a caption or a link (the API can't add link stickers), so each card shows its
// sign's address.
async function instagramStory(c) {
  const { env } = c;
  for (const [part, url] of [['cover', c.image('story-cover')], ...SIGNS.map((s) => [s.slug, c.image('story', s)])]) {
    await c.once('instagram_story:' + part, url, async () => {
      const story = await igMake(env, { media_type: 'STORIES', image_url: url });
      await igReady(env, story.id);
      return igPublish(env, story.id);
    });
  }
}

// ---------- Reddit (script app, OAuth password grant) ----------

async function reddit(c) {
  const { env } = c, ua = 'cloudflare-worker:dailyaihoroscope:1.0 (by /u/' + env.REDDIT_USERNAME + ')';
  const title = 'Daily AI Horoscope, ' + c.long + ': 12 lines written by an AI';
  const text = 'Twelve horoscope-style lines for ' + c.long + ', written by an AI as a small experiment on the Barnum effect.\n\n' +
    SIGNS.map((s) => '**' + s.glyph + ' ' + s.name + '**: ' + c.line(s)).join('\n\n') +
    '\n\n*' + DISCLAIMER + '*\n\n[' + c.site.replace(/^https?:\/\//, '') + '](' + c.site + ') · ' + INVITE;
  await c.once('reddit', title + '\n' + text, async () => {
    const tok = await (await call('Reddit login', 'https://www.reddit.com/api/v1/access_token',
      form({ grant_type: 'password', username: env.REDDIT_USERNAME, password: env.REDDIT_PASSWORD },
        { Authorization: 'Basic ' + btoa(env.REDDIT_CLIENT_ID + ':' + env.REDDIT_CLIENT_SECRET), 'User-Agent': ua }))).json();
    if (!tok.access_token) throw new Error('Reddit login: ' + JSON.stringify(tok).slice(0, 200));
    const r = await (await call('Reddit post', 'https://oauth.reddit.com/api/submit',
      form({ sr: env.REDDIT_SUBREDDIT, kind: 'self', title, text, api_type: 'json' }, { Authorization: 'Bearer ' + tok.access_token, 'User-Agent': ua }))).json();
    if (r.json && r.json.errors && r.json.errors.length) throw new Error('Reddit post: ' + JSON.stringify(r.json.errors));
    return r.json && r.json.data;
  });
}

// ---------- Running it ----------

const PLATFORMS = {
  bluesky: { run: bluesky, keys: ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'] },
  x: { run: x, keys: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'] },
  facebook: { run: facebook, keys: ['META_PAGE_ID', 'META_PAGE_TOKEN'] },
  instagram: { run: instagram, keys: ['INSTAGRAM_USER_ID', 'META_PAGE_TOKEN'] },
  instagram_story: { run: instagramStory, keys: ['INSTAGRAM_USER_ID', 'META_PAGE_TOKEN'] },
  reddit: { run: reddit, keys: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD', 'REDDIT_SUBREDDIT'] }
};

// day: { date, signs } as published to R2.
export async function share(env, day) {
  const site = (env.SITE || 'https://dailyaihoroscope.com').replace(/\/$/, '');
  const dry = env.SOCIAL_DRY_RUN !== 'false';
  const names = String(env.SOCIAL || '').split(',').map((s) => s.trim()).filter(Boolean);
  const when = new Date(day.date + 'T12:00:00Z');
  const long = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const base = {
    env, site, date: day.date, long,
    // First post of the X thread.
    rootText: 'Today’s 12 horoscopes for ' + long + '. ' + DISCLAIMER + '\n\n' + INVITE + '\n' + site,
    short: when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    line: (s) => day.signs[s.key],
    image: (kind, s) => kind === 'cover' ? site + '/post/cover-' + day.date + '.jpg'
      : kind === 'story-cover' ? site + '/story/cover-' + day.date + '.jpg'
      : site + '/' + kind + '/' + s.slug + '-' + day.date + (kind === 'og' ? '.png' : '.jpg')
  };

  // The posts link to the day's images, which the site build publishes after 10:00. A
  // missing file still answers 200 with the home page, so check that it is an image.
  for (const kind of ['og', 'post', 'story']) {
    const res = await fetch(base.image(kind, SIGNS[0]), { method: 'HEAD' });
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') || ''))
      throw new Error('Images for ' + day.date + ' are not on the site yet (' + res.status + ' ' + res.headers.get('content-type') + '); the next run will try again.');
  }

  const results = await Promise.allSettled(names.map(async (name) => {
    const p = PLATFORMS[name];
    if (!p) throw new Error('unknown platform');
    const missing = p.keys.filter((k) => !env[k]);
    if (missing.length && !dry) throw new Error('missing ' + missing.join(', '));
    await p.run({
      ...base,
      // Posts once per part and day; in a dry run it only logs.
      async once(part, text, post) {
        const key = 'posted:' + day.date + ':' + part;
        const done = await env.HOROSCOPES.get(key, 'json');
        if (done) return done;
        if (dry) { console.log('[dry run] ' + part + ':\n' + text); return { id: 'dry', uri: 'dry', cid: 'dry' }; }
        const out = (await post()) || {};
        await env.HOROSCOPES.put(key, JSON.stringify(out), { expirationTtl: 60 * 86400 });
        console.log('[posted] ' + part + ' ' + (out.id || out.uri || out.url || ''));
        return out;
      }
    });
  }));
  results.forEach((r, i) => console.log((r.status === 'fulfilled' ? '[ok] ' : '[failed] ') + names[i] + (r.reason ? ': ' + r.reason.message : '')));
  return results.map((r, i) => ({ name: names[i], error: r.reason ? explain(r.reason.message) : null }));
}
