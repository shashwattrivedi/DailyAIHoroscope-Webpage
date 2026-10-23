// A private, holistic view of the project: once a day (14:00 UTC run) the Worker
// collects a snapshot of the site and the social accounts, keeps it in KV
// (report:YYYY-MM-DD, private; never in the public R2 bucket), emails a summary to
// ALERT_TO, and serves the history at /dashboard (secret DASHBOARD_KEY).
//
// - Site: Google Analytics Data API for the previous day (GA_PROPERTY_ID and a
//   read-only service account key in GA_SERVICE_ACCOUNT). Skipped until both are set.
// - Bluesky: public profile and post counts. Instagram and Facebook: Graph API with
//   the Page token the posting already uses.
// - Hashtag stories (stats.js), and what the Worker wrote and posted that day.
// - Keys: the expiry and state of every token (checkTokens in ops.js).

import { mail, explain, checkTokens } from './ops.js';
import { SOCIAL_LINKS } from '../../js/social-links.js';

const DAY = 86400000;
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const graph = (env, path) => 'https://graph.facebook.com/' + (env.META_GRAPH_VERSION || 'v23.0') + '/' + path +
  (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(env.META_PAGE_TOKEN);

async function getJson(what, url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(what + ': ' + (body.error ? body.error.message || JSON.stringify(body.error) : 'HTTP ' + res.status));
  return body;
}

// ---------- Social accounts ----------

async function bluesky(env) {
  const actor = String(env.BLUESKY_HANDLE || '').trim().replace(/^@/, '');
  if (!actor) return null;
  const api = 'https://api.bsky.app/xrpc/';
  const p = await getJson('Bluesky profile', api + 'app.bsky.actor.getProfile?actor=' + encodeURIComponent(actor));
  const out = { followers: p.followersCount, posts: p.postsCount, likes: 0, reposts: 0, replies: 0 };
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const f = await getJson('Bluesky feed', api + 'app.bsky.feed.getAuthorFeed?filter=posts_no_replies&limit=100&actor=' + encodeURIComponent(actor) +
      (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    for (const item of f.feed || []) {
      if (item.reason) continue; // a repost of someone else's post
      out.likes += item.post.likeCount || 0;
      out.reposts += (item.post.repostCount || 0) + (item.post.quoteCount || 0);
      out.replies += item.post.replyCount || 0;
    }
    if (!f.cursor || !(f.feed || []).length) break;
    cursor = f.cursor;
  }
  return out;
}

async function instagram(env) {
  if (!env.INSTAGRAM_USER_ID || !env.META_PAGE_TOKEN) return null;
  const u = await getJson('Instagram account', graph(env, env.INSTAGRAM_USER_ID + '?fields=followers_count,media_count'));
  const out = { followers: u.followers_count, posts: u.media_count, likes: 0, comments: 0 };
  let url = graph(env, env.INSTAGRAM_USER_ID + '/media?fields=like_count,comments_count&limit=100');
  for (let page = 0; url && page < 10; page++) {
    const m = await getJson('Instagram media', url);
    for (const x of m.data || []) { out.likes += x.like_count || 0; out.comments += x.comments_count || 0; }
    url = m.paging && m.paging.next;
  }
  return out;
}

async function facebook(env) {
  if (!env.META_PAGE_ID || !env.META_PAGE_TOKEN) return null;
  const p = await getJson('Facebook Page', graph(env, env.META_PAGE_ID + '?fields=followers_count,fan_count'));
  const out = { followers: p.followers_count ?? p.fan_count, posts: 0, reactions: 0, comments: 0, shares: 0 };
  let url = graph(env, env.META_PAGE_ID + '/posts?fields=reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares&limit=100');
  for (let page = 0; url && page < 10; page++) {
    const r = await getJson('Facebook posts', url);
    for (const x of r.data || []) {
      out.posts++;
      out.reactions += (x.reactions && x.reactions.summary.total_count) || 0;
      out.comments += (x.comments && x.comments.summary.total_count) || 0;
      out.shares += (x.shares && x.shares.count) || 0;
    }
    url = r.paging && r.paging.next;
  }
  return out;
}

// ---------- Google Analytics (service account, read only) ----------

const b64url = (s) => btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim)));
  const jwt = head + '.' + claim + '.' + b64url(Array.from(sig, (b) => String.fromCharCode(b)).join(''));
  const t = await getJson('Google sign-in', 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  return t.access_token;
}

async function analytics(env) {
  if (!env.GA_PROPERTY_ID || !env.GA_SERVICE_ACCOUNT) return null;
  const token = await googleToken(JSON.parse(env.GA_SERVICE_ACCOUNT));
  const run = (body) => getJson('Google Analytics', 'https://analyticsdata.googleapis.com/v1beta/properties/' + env.GA_PROPERTY_ID + ':runReport', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }], ...body })
  });
  const num = (r, i = 0) => Number(r && r.metricValues[i].value) || 0;
  const [totals, events, countries, pages] = await Promise.all([
    run({ metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }] }),
    run({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }] }),
    run({ dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 5 }),
    run({ dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 5 })
  ]);
  const t = (totals.rows || [])[0];
  return {
    users: num(t, 0), views: num(t, 1), sessions: num(t, 2),
    events: Object.fromEntries((events.rows || []).map((r) => [r.dimensionValues[0].value, num(r)])),
    countries: (countries.rows || []).map((r) => [r.dimensionValues[0].value, num(r)]),
    pages: (pages.rows || []).map((r) => [r.dimensionValues[0].value, num(r)])
  };
}

// ---------- The Worker's own work ----------

// { platform: count } and { platform: [part, …] }, e.g. instagram_story: ['cover', 'aries', …].
async function posting(env, date) {
  const out = {}, parts = {};
  const { keys } = await env.HOROSCOPES.list({ prefix: 'posted:' + date + ':' });
  for (const { name } of keys) {
    const [platform, part] = name.split(':').slice(2);
    if (platform === 'test') continue;
    out[platform] = (out[platform] || 0) + 1;
    if (part) (parts[platform] ||= []).push(part);
  }
  return { out, parts };
}

// Runs every collector; one failing doesn't stop the others (its error is kept).
export async function collect(env, now = Date.now()) {
  const date = ymd(now + 14 * 3600000); // the newest horoscope date
  const snap = { at: new Date(now).toISOString(), date, errors: {} };
  const parts = { ga: analytics, bluesky, instagram, facebook };
  await Promise.all(Object.entries(parts).map(async ([k, f]) => {
    try { snap[k] = await f(env); } catch (e) { snap[k] = null; snap.errors[k] = e.message; }
  }));
  const stats = await env.DATA.get('data/stats.json');
  snap.hashtag = stats ? await stats.json().then((s) => ({ total: s.total, week: s.week })) : null;
  snap.written = !!(await env.HOROSCOPES.get('day:' + date));
  snap.social = env.SOCIAL;
  snap.xThread = env.X_THREAD !== 'false';
  ({ out: snap.posted, parts: snap.postedParts } = await posting(env, date));
  snap.tokens = await env.HOROSCOPES.get('tokens', 'json'); // from the 10:00 run (ops.js)
  await env.HOROSCOPES.put('report:' + ymd(now), JSON.stringify(snap), { expirationTtl: 400 * 86400 });
  return snap;
}

async function history(env, days) {
  const { keys } = await env.HOROSCOPES.list({ prefix: 'report:' });
  const names = keys.map((k) => k.name).sort().slice(-days);
  return (await Promise.all(names.map((n) => env.HOROSCOPES.get(n, 'json')))).filter(Boolean);
}

// [section, label, value] rows shown in the email and on the dashboard.
const g = (o, ...path) => path.reduce((v, k) => (v == null ? v : v[k]), o);
// An event count: 0 when GA was read and nothing happened, — only when GA couldn't be read.
const ev = (s, name) => (s.ga ? g(s, 'ga', 'events', name) || 0 : null);
const ROWS = [
  ['Site (Google Analytics, previous day)', 'Visitors', (s) => g(s, 'ga', 'users')],
  ['', 'Page views', (s) => g(s, 'ga', 'views')],
  ['', 'Sign switches', (s) => ev(s, 'select_sign')],
  ['', 'Shares', (s) => ev(s, 'share')],
  ['', 'Cards saved', (s) => ev(s, 'save_card')],
  ['', 'Read stories clicks', (s) => ev(s, 'read_stories')],
  ['', 'Widget snippets copied', (s) => ev(s, 'copy_embed')],
  ['Bluesky', 'Followers', (s) => g(s, 'bluesky', 'followers')],
  ['', 'Likes (all posts)', (s) => g(s, 'bluesky', 'likes')],
  ['', 'Reposts', (s) => g(s, 'bluesky', 'reposts')],
  ['', 'Replies', (s) => g(s, 'bluesky', 'replies')],
  ['Instagram', 'Followers', (s) => g(s, 'instagram', 'followers')],
  ['', 'Likes (all posts)', (s) => g(s, 'instagram', 'likes')],
  ['', 'Comments', (s) => g(s, 'instagram', 'comments')],
  ['Facebook', 'Page followers', (s) => g(s, 'facebook', 'followers')],
  ['', 'Reactions (all posts)', (s) => g(s, 'facebook', 'reactions')],
  ['', 'Comments', (s) => g(s, 'facebook', 'comments')],
  ['', 'Shares', (s) => g(s, 'facebook', 'shares')],
  ['#DailyAIHoroscopeWasCorrect', 'Stories (all time)', (s) => g(s, 'hashtag', 'total')]
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
function change(v, p) {
  if (v == null || p == null || v === p) return '';
  const d = v - p;
  return '<span style="color:' + (d > 0 ? '#1F9D55' : '#C0392B') + '">' + (d > 0 ? '+' : '') + d.toLocaleString('en-US') + '</span>';
}

const STORY_ORDER = ['cover', 'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
const short = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The report covers three different days; say which is which.
const dates = (s) => '<p style="margin:0 0 10px;font-size:13px;color:#555">Report for ' + short(s.at.slice(0, 10)) + ' · posts for ' + short(s.date) +
  ' · site traffic for ' + short(ymd(Date.parse(s.at) - DAY)) + ' (Google Analytics, previous day)</p>';

function status(s) {
  const posted = s.posted || {};
  const item = (name, ok, text) => '<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:' +
    (ok ? '#E3F6EA;color:#1F7A45' : '#FDE8E6;color:#B03A2E') + '">' + name + ': ' + text + '</span>';
  // A partial run of stories: name the last one that went out (they post in this order).
  const stories = posted.instagram_story || 0, done = (s.postedParts || {}).instagram_story || [];
  const last = STORY_ORDER.filter((p) => done.includes(p)).pop();
  return item('Horoscopes for ' + short(s.date), s.written, s.written ? 'written' : 'missing') +
    item('Bluesky', posted.bluesky >= 12, (posted.bluesky || 0) + '/12') +
    item('Instagram', posted.instagram >= 1, posted.instagram ? 'posted' : 'not posted') +
    item('Instagram stories', stories >= 13, stories + '/13' + (stories && stories < 13 && last ? ' (up to ' + last + ')' : '')) +
    item('Facebook', posted.facebook >= 1, posted.facebook ? 'posted' : 'not posted') +
    (/\bx\b/.test(s.social || '') ? item('X', posted.x >= (s.xThread ? 13 : 1), (posted.x || 0) + '/' + (s.xThread ? 13 : 1)) : '');
}

function errors(s) {
  const e = Object.entries(s.errors || {});
  return e.length ? '<p style="color:#B03A2E;font-size:13px">Couldn\'t read: ' + e.map(([k, m]) => esc(k + ' (' + explain(m) + ')')).join('; ') + '</p>' : '';
}

function lists(s) {
  if (!s.ga) return '<p style="font-size:13px;color:#777">Google Analytics isn\'t connected yet (GA_PROPERTY_ID and GA_SERVICE_ACCOUNT).</p>';
  const li = (rows) => rows.map(([k, v]) => '<li>' + esc(k) + ': <b>' + fmt(v) + '</b></li>').join('') || '<li>—</li>';
  return '<table role="presentation" style="width:100%;font-size:14px"><tr><td style="vertical-align:top;padding-right:16px"><b>Top countries</b><ul style="padding-left:18px">' +
    li(s.ga.countries) + '</ul></td><td style="vertical-align:top"><b>Top pages</b><ul style="padding-left:18px">' + li(s.ga.pages) + '</ul></td></tr></table>';
}

// A tiny line chart of the last values (inline SVG works on the dashboard, not in most email).
function spark(values) {
  const v = values.map((x) => (x == null ? null : Number(x)));
  const known = v.filter((x) => x != null);
  if (known.length < 2) return '';
  const min = Math.min(...known), max = Math.max(...known), w = 120, h = 28;
  const pts = v.map((x, i) => (x == null ? null : [(i / (v.length - 1)) * w, h - 3 - ((x - min) / (max - min || 1)) * (h - 6)])).filter(Boolean);
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><polyline fill="none" stroke="#FF6BB5" stroke-width="2" points="' +
    pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/></svg>';
}

function table(s, prev, hist) {
  return '<table style="width:100%;border-collapse:collapse;font-size:14px">' + ROWS.map(([section, label, get]) =>
    (section ? '<tr><td colspan="4" style="padding:14px 0 4px;font-weight:800;border-bottom:2px solid #111">' + esc(section) + '</td></tr>' : '') +
    '<tr><td style="padding:6px 0;border-bottom:1px solid #eee">' + esc(label) + '</td>' +
    '<td style="text-align:right;font-weight:800;border-bottom:1px solid #eee">' + fmt(get(s)) + '</td>' +
    '<td style="text-align:right;width:70px;border-bottom:1px solid #eee">' + change(get(s), prev && get(prev)) + '</td>' +
    (hist ? '<td style="text-align:right;width:130px;border-bottom:1px solid #eee">' + spark(hist.map(get)) + '</td>' : '<td></td>') + '</tr>').join('') + '</table>';
}

// Every key, its expiry and days left: green when fine or never expires, amber within
// 30 days, red within 7 days or when it doesn't work.
function tokens(t, now) {
  if (!t) return '<p style="font-size:13px;color:#777">Keys: not checked yet (the 10:00 UTC run checks them).</p>';
  const cell = 'padding:6px 8px 6px 0;border-bottom:1px solid #eee';
  return '<b>Keys</b> <span style="font-size:12px;color:#777">checked ' + esc(t.at.replace('T', ' ').slice(0, 16)) + ' UTC</span>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:6px">' + t.rows.map((r) => {
      const days = r.expires ? Math.floor((r.expires - now) / DAY) : null;
      const bad = !r.ok || (days != null && days <= 7), warn = days != null && days <= 30;
      const dot = bad ? '#C0392B' : warn ? '#E0A100' : '#1F9D55';
      return '<tr><td style="' + cell + '"><span style="color:' + dot + '">●</span> ' + esc(r.name) +
        '<div style="font-size:12px;color:#777">' + esc(r.secret) + (r.note ? ' · ' + esc(r.note) : '') + '</div></td>' +
        '<td style="' + cell + ';white-space:nowrap">' + (r.expires ? ymd(r.expires) : r.ok ? 'never' : '—') + '</td>' +
        '<td style="' + cell + ';text-align:right;white-space:nowrap;font-weight:800;color:' + dot + '">' + (days != null ? days + ' days' : r.ok ? 'OK' : 'failing') + '</td>' +
        '<td style="' + cell + ';text-align:right"><a href="' + esc(r.renew) + '" style="font-size:12px">renew</a></td></tr>';
    }).join('') + '</table>';
}

const SOCIAL_REPORT_LINKS = SOCIAL_LINKS.map(({ url, label }) => '<a href="' + url + '">' + label + '</a>').join(' · ');
const LINKS = '<p style="font-size:13px"><a href="https://analytics.google.com/">Google Analytics</a> · ' + SOCIAL_REPORT_LINKS + ' · ' +
  '<a href="https://dash.cloudflare.com/">Cloudflare</a> · <a href="https://dailyaihoroscope.com/">Site</a></p>';

// 14:00 UTC run: collect, keep, and email the summary.
export async function dailyReport(env, now = Date.now()) {
  const snap = await collect(env, now);
  const prev = await env.HOROSCOPES.get('report:' + ymd(now - DAY), 'json');
  const body = '<div style="font-family:system-ui,sans-serif;max-width:640px;color:#111">' +
    '<h2 style="margin:0 0 8px">Daily AI Horoscope · ' + esc(ymd(now)) + '</h2>' + dates(snap) + status(snap) + table(snap, prev) + lists(snap) + errors(snap) + tokens(snap.tokens, now) +
    (env.DASHBOARD_URL ? '<p><a href="' + esc(env.DASHBOARD_URL) + '">Open the dashboard</a> (30-day trends)</p>' : '') + LINKS +
    '<p style="font-size:12px;color:#777">Changes are against the previous day\'s report.</p></div>';
  await mail(env, 'Daily AI Horoscope report · ' + ymd(now), body, 'html');
  return snap;
}

// ---------- /dashboard (private) ----------

async function sha(s) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Open once with ?key=<DASHBOARD_KEY>; a cookie keeps you signed in on that browser.
// Anyone without it gets a plain 404.
export async function dashboard(req, env) {
  const url = new URL(req.url), notFound = new Response('Not found', { status: 404 });
  if (!env.DASHBOARD_KEY) return notFound;
  const want = await sha(env.DASHBOARD_KEY);
  const key = url.searchParams.get('key');
  if (key) {
    if ((await sha(key)) !== want) return notFound;
    return new Response(null, { status: 303, headers: {
      Location: url.pathname, 'Set-Cookie': 'dash=' + want + '; Path=/dashboard; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict' } });
  }
  const cookie = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)dash=([0-9a-f]+)/);
  if (!cookie || cookie[1] !== want) return notFound;

  if (url.searchParams.has('refresh') || url.searchParams.has('mail')) {
    await env.HOROSCOPES.put('tokens', JSON.stringify(await checkTokens(env)));
    await (url.searchParams.has('mail') ? dailyReport(env) : collect(env));
    return new Response(null, { status: 303, headers: { Location: url.pathname } });
  }
  const hist = await history(env, 30);
  const s = hist[hist.length - 1], prev = hist[hist.length - 2];
  const days = hist.slice(-14).map((h) => '<tr><td>' + esc(h.at.slice(0, 10)) + '</td><td>' + status(h) + '</td></tr>').join('');
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>Dashboard · Daily AI Horoscope</title>' +
    '<style>body{margin:0;background:#F5F3EE;color:#111;font-family:system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:24px 16px 48px}' +
    'h1{font-size:28px;margin:0 0 4px}a{color:#111}.card{background:#fff;border-radius:16px;padding:16px 18px;margin:16px 0}' +
    '.top{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}.btn{padding:8px 14px;border-radius:999px;background:#111;color:#F5F3EE;text-decoration:none;font-weight:700;font-size:14px}' +
    'table td{vertical-align:middle}</style></head><body><main>' +
    '<div class="top"><h1>Daily AI Horoscope</h1><span><a class="btn" href="?refresh">Refresh now</a> <a class="btn" href="?mail">Email me this</a></span></div>' +
    (s ? '<p style="color:#555;margin:0">Last collected ' + esc(s.at.replace('T', ' ').slice(0, 16)) + ' UTC · ' + hist.length + ' day' + (hist.length > 1 ? 's' : '') + ' of history</p>' +
      '<div class="card">' + dates(s) + status(s) + '</div><div class="card">' + table(s, prev, hist) + '</div><div class="card">' + lists(s) + errors(s) + '</div>' +
      '<div class="card">' + tokens(s.tokens, Date.now()) + '</div>' +
      '<div class="card"><b>Last 14 days</b><table style="width:100%;font-size:13px;margin-top:8px">' + days + '</table></div>'
      : '<p>No reports yet. Use Refresh now.</p>') +
    LINKS + '</main></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
