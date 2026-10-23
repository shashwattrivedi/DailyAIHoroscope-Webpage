// Votes on the day's lines: "Did this feel true?" (#19).
//
// POST /v1/vote { date, sign, felt: true|false, voter } records (or changes) a visitor's
// vote on one sign's line and answers with that line's tally { yes, total }. GET
// /v1/vote?date=&sign= answers the tally alone. The browser never learns which model
// wrote the line: the Worker looks it up in arena:<date> and stores it with the vote.
//
// - One vote per visitor (a random ID the page keeps in localStorage), date and sign;
//   voting again changes it.
// - Only for dates that are "today" somewhere (plus an hour's grace), from the site.
// - At most IP_CAP votes per IP address and UTC day. The address is kept only as a hash
//   with a random salt that changes daily (KV vote:salt:<day>, deleted after two days),
//   so it can't be recovered; the counts go after a week (cleanup()).

import { SIGNS } from './writer.js';

const IP_CAP = 60;
const DAY = 86400000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

// Which model wrote each sign's line, per date (a date's choice never changes).
const chosen = new Map();
async function modelFor(env, date, sign) {
  if (!chosen.has(date)) {
    const rec = await env.HOROSCOPES.get('arena:' + date, 'json');
    if (rec) chosen.set(date, rec.chosen);
    else return null; // before the arena, or not written yet
  }
  return chosen.get(date)[sign] || null;
}

async function salt(env, day) {
  const key = 'vote:salt:' + day;
  let s = await env.HOROSCOPES.get(key);
  if (!s) {
    s = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    await env.HOROSCOPES.put(key, s, { expirationTtl: 2 * 86400 });
  }
  return s;
}

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

const tally = async (env, date, sign) => {
  const r = await env.VOTES.prepare('SELECT COALESCE(SUM(felt), 0) AS yes, COUNT(*) AS total FROM votes WHERE date = ? AND sign = ?').bind(date, sign).first();
  return { yes: r.yes, total: r.total };
};

// current(date): whether the date is "today" somewhere (index.js). Returns a Response.
export async function vote(req, env, current) {
  const site = (env.SITE || 'https://dailyaihoroscope.com').replace(/\/$/, '');
  const origin = req.headers.get('Origin') || '';
  const allowed = origin === site || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': allowed ? origin : site, Vary: 'Origin' };
  const out = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || '', sign = url.searchParams.get('sign') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !SIGNS.includes(sign)) return out({ error: 'date and sign are required' }, 400);
    return out(await tally(env, date, sign), 200, { 'Cache-Control': 'public, max-age=30' });
  }
  if (req.method !== 'POST') return out({ error: 'Use POST' }, 405);
  if (!allowed) return out({ error: 'Votes are only taken on the site' }, 403);

  let body;
  try { body = JSON.parse(await req.text()); } catch (e) { return out({ error: 'Send JSON' }, 400); }
  const { date, sign, felt, voter } = body || {};
  if (typeof date !== 'string' || !current(date)) return out({ error: 'Votes are only taken while the date is today somewhere' }, 400);
  if (!SIGNS.includes(sign) || typeof felt !== 'boolean' || !/^[0-9a-f-]{36}$/.test(voter || '')) return out({ error: 'Bad vote' }, 400);

  const day = ymd(Date.now());
  const ip = await sha((await salt(env, day)) + (req.headers.get('CF-Connecting-IP') || ''));
  const cap = await env.VOTES.prepare('INSERT INTO ip_caps (day, ip, n) VALUES (?, ?, 1) ON CONFLICT (day, ip) DO UPDATE SET n = n + 1 RETURNING n').bind(day, ip).first();
  if (cap.n > IP_CAP) return out({ error: 'Too many votes from here today' }, 429);

  await env.VOTES.prepare('INSERT INTO votes (date, sign, voter, felt, model, at) VALUES (?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT (date, sign, voter) DO UPDATE SET felt = excluded.felt, at = excluded.at')
    .bind(date, sign, voter, felt ? 1 : 0, await modelFor(env, date, sign), new Date().toISOString()).run();
  return out(await tally(env, date, sign));
}

// Daily: forget the IP counts after a week.
export async function cleanup(env, now = Date.now()) {
  await env.VOTES.prepare('DELETE FROM ip_caps WHERE day < ?').bind(ymd(now - 7 * DAY)).run();
}
