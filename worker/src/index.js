// Daily AI Horoscope API.
//
// A new set of 12 lines is written for each calendar date. A date first exists at
// 00:00 in UTC+14 (Line Islands, the first place on Earth to reach it) and is still
// "today" until 24:00 in UTC-12, so a visitor anywhere sees the lines for their own
// local date. The daily cron writes each date as it starts and fills in any date that
// is current somewhere and still missing.
//
// Lines are kept in KV (private) and published to the public R2 bucket as
// data/YYYY-MM-DD.json, which the CDN serves to visitors without running this Worker.
// /v1/horoscope is only the fallback.

import { share } from './social.js';
import { buildSite, imagesLive, checkTokens, alert } from './ops.js';

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpius', 'Sagittarius', 'Capricornus', 'Aquarius', 'Pisces'];
const FIRST_TZ = 14; // hours ahead of UTC
const LAST_TZ = -12;
const DAY = 86400000;

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
// Dates that are "today" somewhere right now: [date in UTC-12, date in UTC+14].
const window_ = (now) => [ymd(now + LAST_TZ * 3600000), ymd(now + FIRST_TZ * 3600000)];

function datesBetween(a, b) {
  const out = [];
  for (let t = Date.parse(a); t <= Date.parse(b); t += DAY) out.push(ymd(t));
  return out;
}

// Each sign gets two random moods, so the lines have nothing to do with the sign itself.
const MOODS = ['fear', 'disappointment', 'strength', 'uncertainty', 'anxiety', 'playfulness', 'joy', 'caution', 'independence',
  'stability', 'balance', 'optimism', 'stress', 'clarity', 'restlessness', 'hesitation', 'overwhelm', 'doubt', 'perseverance',
  'creativity', 'tranquility', 'motivation', 'enthusiasm', 'conflict', 'healing', 'solitude', 'resilience', 'frustration',
  'sadness', 'reflection', 'nostalgia', 'curiosity', 'impatience', 'gratitude', 'boredom', 'courage', 'relief', 'confusion',
  'surprise', 'pride', 'regret', 'hope', 'calm', 'excitement', 'loneliness', 'warmth', 'tiredness', 'determination'];

function pick(list, n) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

function prompt(previous) {
  const moods = pick(MOODS, 24);
  return `Write 12 short horoscope-style sentences for one day, one per line, each built around the two moods given.
Rules:
- One sentence each, 10 to 22 words.
- Vague and general enough to fit almost anyone's day, the way newspaper horoscopes are.
- Base each sentence only on its two moods. Ignore the zodiac sign's traditional traits completely.
- No instructions, advice, or commands; do not tell the reader to do anything. Describe, don't direct.
- Never mention health, medicine, money decisions, or other people's names.
- Do not mention any sign name inside the sentences.
${previous ? 'Do not reuse or closely echo any of these lines from the previous day:\n' + Object.values(previous).join('\n') + '\n' : ''}
Moods:
${SIGNS.map((s, i) => `${s}: ${moods[i * 2]} + ${moods[i * 2 + 1]}`).join('\n')}

Output exactly 12 lines and nothing else, in this format:
${SIGNS.map((s) => s + ': <sentence>').join('\n')}`;
}

function parse(text) {
  const out = {};
  for (const raw of String(text).split('\n')) {
    const m = raw.replace(/[*_#]/g, '').trim().match(/^([A-Za-z]+)\s*:\s*(.+)$/);
    if (!m) continue;
    const sign = SIGNS.find((s) => s.toLowerCase() === m[1].toLowerCase() || (s === 'Scorpius' && /^scorpio$/i.test(m[1])) || (s === 'Capricornus' && /^capricorn$/i.test(m[1])));
    const line = m[2].trim().replace(/^["“]|["”]$/g, '');
    if (sign && line.length > 10 && line.length < 260) out[sign] = line;
  }
  return SIGNS.every((s) => out[s]) ? out : null;
}

async function generate(env, date) {
  const prev = await env.HOROSCOPES.get('day:' + ymd(Date.parse(date) - DAY), 'json');
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await env.AI.run(env.MODEL, {
      messages: [
        { role: 'system', content: 'You write short, vague, horoscope-style sentences for a light-hearted experiment about the Barnum effect.' },
        { role: 'user', content: prompt(prev && prev.signs) }
      ],
      max_tokens: 900,
      temperature: 0.9
    });
    last = res.response ?? res.choices?.[0]?.message?.content ?? '';
    const signs = parse(last);
    if (signs) return { date, signs, model: env.MODEL, createdAt: new Date().toISOString() };
  }
  throw new Error('Model output did not contain 12 signs: ' + last.slice(0, 300));
}

// The R2 file is the final version of a day. If two requests write the same missing
// day at once, the first upload wins and the other request uses that file instead of
// its own lines, so the CDN, KV and the API always agree. KV only stores what was
// published.
async function ensure(env, date) {
  const key = 'day:' + date;
  const have = await env.HOROSCOPES.get(key, 'json');
  if (have) return have;
  const day = (await published(env, date)) || (await publish(env, await generate(env, date)));
  await env.HOROSCOPES.put(key, JSON.stringify(day));
  return day;
}

const fileKey = (date) => 'data/' + date + '.json';

async function published(env, date) {
  const obj = await env.DATA.get(fileKey(date));
  return obj ? await obj.json() : null;
}

// Uploads only if no file exists yet (If-None-Match: *). A day's lines never change
// once written, so the CDN may keep the file for a week.
async function publish(env, day) {
  const body = { date: day.date, signs: day.signs };
  const put = await env.DATA.put(fileKey(day.date), JSON.stringify(body), {
    onlyIf: new Headers({ 'If-None-Match': '*' }),
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=604800, immutable' }
  });
  return put ? body : await published(env, day.date);
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } });

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);

    if (url.pathname === '/v1/horoscope') {
      const date = url.searchParams.get('date') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ymd(Date.parse(date)) !== date) return json({ error: 'date must be YYYY-MM-DD' }, 400);
      const [first, last] = window_(Date.now());
      // No peeking: a date is only served once it has started somewhere on Earth.
      if (date > last) return json({ error: 'This date has not started anywhere yet.' }, 404);
      let day = await env.HOROSCOPES.get('day:' + date, 'json');
      // Backstop if the cron missed: write it on demand, but only for dates that are current.
      if (!day && date >= first) {
        try { day = await ensure(env, date); } catch (e) { return json({ error: 'Not ready yet, try again shortly.' }, 503); }
      }
      if (!day) return json({ error: 'No horoscope for this date.' }, 404);
      const settled = date < first; // no longer "today" anywhere, will never change
      return json({ date: day.date, signs: day.signs }, 200, { 'Cache-Control': settled ? 'public, max-age=86400' : 'public, max-age=300' });
    }

    if (url.pathname === '/') return json({ ok: true, usage: '/v1/horoscope?date=YYYY-MM-DD (your local date)' });
    return json({ error: 'Not found' }, 404);
  },

  // Runs at 10:00, 12:00 and 14:00 UTC:
  // 1. Writes and publishes any date that is current somewhere and missing (at 10:00,
  //    the date that just started).
  // 2. If the site doesn't have that date's images yet, starts the site build (10:00,
  //    and again at 12:00 if the first build didn't land).
  // 3. From 12:00, shares it on social media; 14:00 retries what didn't post.
  // Anything that is still wrong is emailed: failures that a later run can't fix, and
  // (at 10:00) keys that are invalid or about to expire.
  async scheduled(event, env, ctx) {
    const now = event.scheduledTime || Date.now();
    const hour = new Date(now).getUTCHours(), lastRun = hour >= 14;
    const [first, last] = window_(now);
    const problems = [];

    for (const date of datesBetween(first, last)) {
      try { await ensure(env, date); } catch (e) { problems.push('Writing the horoscopes for ' + date + ' failed: ' + e.message); }
    }

    const day = await env.HOROSCOPES.get('day:' + last, 'json');
    if (day) {
      if (!(await imagesLive(env, day.date))) {
        if (lastRun) problems.push('The site still has no images for ' + day.date + ', so nothing was posted. Check the Deploy action on GitHub.');
        else await buildSite(env).catch((e) => problems.push(e.message));
      } else if (hour >= 12) {
        const failed = (await share(env, day).catch((e) => [{ name: 'social media', error: e.message }])).filter((r) => r.error);
        if (lastRun) failed.forEach((r) => problems.push('Posting to ' + r.name + ' failed: ' + r.error));
      }
    }

    if (hour === 10) problems.push(...(await checkTokens(env, now)));
    if (problems.length) await alert(env, 'Daily AI Horoscope: ' + problems.length + ' problem' + (problems.length > 1 ? 's' : '') + ' (' + last + ')', problems);
  }
};
