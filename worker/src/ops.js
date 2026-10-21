// Keeping the daily run going without anyone watching it:
//
// - buildSite: starts the GitHub Action that rebuilds the site with the day's lines and
//   images. The Worker starts it rather than a GitHub schedule, because GitHub turns off
//   scheduled workflows in a repo with no commits for 60 days.
// - checkTokens: finds keys that are invalid or expire within WARN_DAYS.
// - alert: emails the problems of a run to ALERT_TO (Cloudflare Email Routing; the
//   address must be a verified destination). Both are secrets, never in the repo.

import { EmailMessage } from 'cloudflare:email';

const WARN_DAYS = 14;
const DAY = 86400000;

const github = (env, path, init = {}) => fetch('https://api.github.com/repos/' + env.GITHUB_REPO + path, {
  ...init,
  headers: {
    Authorization: 'Bearer ' + env.GH_DISPATCH_TOKEN, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'dailyaihoroscope-worker', ...(init.headers || {})
  }
});

export async function buildSite(env) {
  if (!env.GH_DISPATCH_TOKEN) throw new Error('GH_DISPATCH_TOKEN is not set, so the site can\'t be rebuilt.');
  const res = await github(env, '/actions/workflows/' + (env.GITHUB_WORKFLOW || 'deploy.yml') + '/dispatches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' })
  });
  if (res.status !== 204) throw new Error('Starting the site build failed: HTTP ' + res.status + ' ' + (await res.text()).slice(0, 300));
  console.log('[build] started');
}

// True once the site build has published the day's images. A missing file still
// answers 200 with the home page, so check that it is an image.
export async function imagesLive(env, date) {
  const site = (env.SITE || 'https://dailyaihoroscope.com').replace(/\/$/, '');
  for (const path of ['/og/aries-' + date + '.png', '/post/aries-' + date + '.jpg']) {
    const res = await fetch(site + path, { method: 'HEAD' });
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') || '')) return false;
  }
  return true;
}

const soon = (t, now) => t && t - now < WARN_DAYS * DAY;
const when = (t) => new Date(t).toISOString().slice(0, 10);

export async function checkTokens(env, now = Date.now()) {
  const out = [];

  if (env.META_PAGE_TOKEN) {
    // A token can inspect itself. expires_at 0 means it never expires; data access
    // still ends 90 days after the token was last approved in Facebook Login.
    const url = 'https://graph.facebook.com/' + (env.META_GRAPH_VERSION || 'v23.0') + '/debug_token?input_token=' +
      encodeURIComponent(env.META_PAGE_TOKEN) + '&access_token=' + encodeURIComponent(env.META_PAGE_TOKEN);
    try {
      const d = (await (await fetch(url)).json()).data || {};
      if (!d.is_valid) out.push('The Meta Page token (META_PAGE_TOKEN) is no longer valid. Facebook and Instagram posts will fail until it is replaced.');
      else {
        if (soon(d.expires_at * 1000, now)) out.push('The Meta Page token (META_PAGE_TOKEN) expires on ' + when(d.expires_at * 1000) + '.');
        if (soon(d.data_access_expires_at * 1000, now)) out.push('Meta data access for META_PAGE_TOKEN ends on ' + when(d.data_access_expires_at * 1000) +
          '. Generate a new token in the Graph API Explorer before then.');
      }
    } catch (e) {
      out.push('Couldn\'t check the Meta token: ' + e.message);
    }
  }

  if (!env.GH_DISPATCH_TOKEN) out.push('GH_DISPATCH_TOKEN is not set, so the site isn\'t rebuilt each day.');
  else {
    const res = await github(env, '');
    // Fine-grained tokens report their expiry on every response, e.g. "2027-10-21 10:00:00 UTC".
    const exp = Date.parse((res.headers.get('github-authentication-token-expiration') || '').replace(' UTC', 'Z').replace(' ', 'T'));
    if (res.status === 401) out.push('The GitHub token (GH_DISPATCH_TOKEN) is no longer valid, so the site can\'t be rebuilt.');
    else if (soon(exp, now)) out.push('The GitHub token (GH_DISPATCH_TOKEN) expires on ' + when(exp) + '.');
  }

  return out;
}

export async function alert(env, subject, problems) {
  const text = problems.map((p) => '- ' + p).join('\n\n') +
    '\n\nDetails are in the Worker logs: Cloudflare dashboard > Workers & Pages > dailyaihoroscope-api > Logs.\n';
  console.log('[alert] ' + subject + '\n' + text);
  await mail(env, subject, text);
}

// Sends an email to ALERT_TO. type: 'plain' or 'html'.
export async function mail(env, subject, body, type = 'plain') {
  if (!env.ALERT_EMAIL || !env.ALERT_TO) return;
  const from = env.ALERT_FROM || 'alerts@dailyaihoroscope.com';
  const raw = [
    'From: Daily AI Horoscope <' + from + '>',
    'To: <' + env.ALERT_TO + '>',
    'Subject: ' + subject,
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + crypto.randomUUID() + '@' + from.split('@')[1] + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/' + type + '; charset=utf-8',
    // base64 keeps long HTML lines within the 998-character limit of email.
    'Content-Transfer-Encoding: base64',
    '',
    btoa(Array.from(new TextEncoder().encode(body), (b) => String.fromCharCode(b)).join('')).replace(/.{76}/g, '$&\r\n')
  ].join('\r\n');
  await env.ALERT_EMAIL.send(new EmailMessage(from, env.ALERT_TO, raw));
}
