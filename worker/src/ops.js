// Keeping the daily run going without anyone watching it:
//
// - buildSite: starts the GitHub Action that rebuilds the site with the day's lines and
//   images. The Worker starts it rather than a GitHub schedule, because GitHub turns off
//   scheduled workflows in a repo with no commits for 60 days.
// - checkTokens: the expiry and state of every key; the ones that are invalid or expire
//   within WARN_DAYS are emailed.
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

// What posting to the Page and Instagram, and reading their stats, need.
const META_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'];
const META_RENEW = 'Make a new one: see "Renewing the Meta token" in the README ' +
  '(https://github.com/shashwattrivedi/DailyAIHoroscope-Webpage#renewing-the-meta-token).';

// Meta answers 190 (or a permission error) when the token was revoked, lost its Page
// permissions, or the Facebook account was logged out by a security check. Retrying
// can't fix that, so say what to do instead of passing on the raw error.
export function explain(message) {
  if (/"code":\s*190|must be granted before impersonating|Error validating access token|session has been invalidated/i.test(message || ''))
    return 'The Meta Page token (META_PAGE_TOKEN) no longer works (' + (message.match(/^[^:]+/) || [''])[0] + '). ' + META_RENEW;
  return message;
}

const when = (t) => new Date(t).toISOString().slice(0, 10);
const RENEW = {
  meta: 'https://github.com/shashwattrivedi/DailyAIHoroscope-Webpage#renewing-the-meta-token',
  github: 'https://github.com/settings/personal-access-tokens',
  cloudflare: 'https://dash.cloudflare.com/profile/api-tokens',
  bluesky: 'https://bsky.app/settings/app-passwords'
};

// One row per key the site depends on, for the dashboard and the daily report:
// { name, secret, ok, expires (ms, null: never), note, renew, problem }. problem is set
// when the key is invalid, failing, or expires within WARN_DAYS, and is what gets emailed.
// Returns { at, rows }; the 10:00 run keeps it in KV (tokens) for the report.
export async function checkTokens(env, now = Date.now()) {
  const rows = [];
  const row = (r) => {
    if (!r.problem && r.expires && r.expires - now < WARN_DAYS * DAY)
      r.problem = 'The ' + r.name + ' (' + r.secret + ') ' + (r.ends || 'expires') + ' on ' + when(r.expires) + '.' + (r.how ? ' ' + r.how : '');
    delete r.ends; delete r.how;
    rows.push({ ok: !r.problem, expires: null, note: '', ...r });
  };
  const failed = (name, secret, renew, problem) => row({ name, secret, renew, problem, note: problem });

  if (env.META_PAGE_TOKEN) {
    // A token can inspect itself. expires_at 0 means it never expires; data access
    // still ends 90 days after the token was last approved in Facebook Login.
    const url = 'https://graph.facebook.com/' + (env.META_GRAPH_VERSION || 'v23.0') + '/debug_token?input_token=' +
      encodeURIComponent(env.META_PAGE_TOKEN) + '&access_token=' + encodeURIComponent(env.META_PAGE_TOKEN);
    const name = 'Meta Page token', secret = 'META_PAGE_TOKEN';
    try {
      const d = (await (await fetch(url)).json()).data || {};
      const missing = META_SCOPES.filter((s) => !(d.scopes || []).includes(s));
      if (!d.is_valid) failed(name, secret, RENEW.meta, 'The Meta Page token (META_PAGE_TOKEN) is no longer valid. Facebook and Instagram posts will fail until it is replaced. ' + META_RENEW);
      else if (d.type !== 'PAGE') failed(name, secret, RENEW.meta, 'META_PAGE_TOKEN is a ' + d.type + ' token, not a Page token, so Page and Instagram calls will fail. ' + META_RENEW);
      else if (missing.length) failed(name, secret, RENEW.meta, 'META_PAGE_TOKEN is missing the permission(s) ' + missing.join(', ') + ', so some posts or stats will fail. ' + META_RENEW);
      else {
        row({ name, secret, renew: RENEW.meta, expires: d.expires_at * 1000 || null, how: META_RENEW });
        row({ name: 'Meta data access', secret, renew: RENEW.meta, expires: d.data_access_expires_at * 1000 || null, ends: 'ends', how: META_RENEW,
          note: 'Stats and posting stop when it ends; logging in to the app again renews it.' });
      }
    } catch (e) {
      failed(name, secret, RENEW.meta, 'Couldn\'t check the Meta token: ' + e.message);
    }
    // Instagram posts with the same token; check the account is still linked to the Page.
    if (env.INSTAGRAM_USER_ID) {
      try {
        const u = await (await fetch('https://graph.facebook.com/' + (env.META_GRAPH_VERSION || 'v23.0') + '/' + env.INSTAGRAM_USER_ID +
          '?fields=username&access_token=' + encodeURIComponent(env.META_PAGE_TOKEN))).json();
        if (u.username) row({ name: 'Instagram', secret, renew: RENEW.meta, note: '@' + u.username + ', uses the Meta Page token' });
        else failed('Instagram', secret, RENEW.meta, 'The Instagram account can\'t be read with META_PAGE_TOKEN (' + ((u.error && u.error.message) || 'no username') + '). Check it is still linked to the Facebook Page.');
      } catch (e) {
        failed('Instagram', secret, RENEW.meta, 'Couldn\'t check the Instagram account: ' + e.message);
      }
    }
  }

  if (!env.GH_DISPATCH_TOKEN) failed('GitHub token', 'GH_DISPATCH_TOKEN', RENEW.github, 'GH_DISPATCH_TOKEN is not set, so the site isn\'t rebuilt each day.');
  else {
    try {
      const res = await github(env, '');
      // Fine-grained tokens report their expiry on every response, e.g. "2027-10-21 10:00:00 UTC".
      const exp = Date.parse((res.headers.get('github-authentication-token-expiration') || '').replace(' UTC', 'Z').replace(' ', 'T'));
      if (res.status === 401) failed('GitHub token', 'GH_DISPATCH_TOKEN', RENEW.github, 'The GitHub token (GH_DISPATCH_TOKEN) is no longer valid, so the site can\'t be rebuilt.');
      else row({ name: 'GitHub token', secret: 'GH_DISPATCH_TOKEN', renew: RENEW.github, expires: exp || null, note: 'Starts the daily site build' });
      if (res.status !== 401) {
        try { await cloudflareToken(env, row); } catch (e) { failed('Cloudflare token', CF_SECRET, RENEW.cloudflare, 'Couldn\'t check the Cloudflare token: ' + e.message); }
      }
    } catch (e) {
      failed('GitHub token', 'GH_DISPATCH_TOKEN', RENEW.github, 'Couldn\'t check the GitHub token: ' + e.message);
    }
  }

  // App passwords don't expire, but can be revoked: try to log in.
  if (env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD) {
    try {
      const res = await fetch((env.BLUESKY_SERVICE || 'https://bsky.social') + '/xrpc/com.atproto.server.createSession', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: env.BLUESKY_HANDLE.trim().replace(/^@/, ''), password: env.BLUESKY_APP_PASSWORD.trim() })
      });
      if (res.ok) row({ name: 'Bluesky', secret: 'BLUESKY_APP_PASSWORD', renew: RENEW.bluesky, note: 'App password, never expires; login works' });
      else failed('Bluesky', 'BLUESKY_APP_PASSWORD', RENEW.bluesky, 'Bluesky login failed (HTTP ' + res.status + '): the app password may have been revoked, so Bluesky posts will fail.');
    } catch (e) {
      failed('Bluesky', 'BLUESKY_APP_PASSWORD', RENEW.bluesky, 'Couldn\'t check the Bluesky login: ' + e.message);
    }
  }

  return { at: new Date(now).toISOString(), rows };
}

// The Cloudflare token (CLOUDFLARE_API_TOKEN) is a GitHub Actions secret the Worker
// doesn't have. The Deploy action checks it and prints a line
// "cloudflare-token: active <expiry date or never>" in its log; read the latest one.
const CF_SECRET = 'CLOUDFLARE_API_TOKEN';
async function cloudflareToken(env, row) {
  const name = 'Cloudflare token', secret = CF_SECRET;
  const runs = await (await github(env, '/actions/workflows/' + (env.GITHUB_WORKFLOW || 'deploy.yml') + '/runs?status=success&per_page=1')).json();
  const run = (runs.workflow_runs || [])[0];
  if (!run) return;
  const jobs = await (await github(env, '/actions/runs/' + run.id + '/jobs')).json();
  const job = (jobs.jobs || [])[0];
  const log = job ? await (await github(env, '/actions/jobs/' + job.id + '/logs')).text() : '';
  const m = log.match(/cloudflare-token: (\S+) (\S+)/);
  if (!m) return row({ name, secret, renew: RENEW.cloudflare, note: 'Not checked yet: the Deploy action prints it from its next run' });
  if (m[1] !== 'active') {
    const problem = 'The Cloudflare token (CLOUDFLARE_API_TOKEN, a GitHub Actions secret) is ' + m[1] + ', so the site can\'t be deployed.';
    return row({ name, secret, renew: RENEW.cloudflare, problem, note: problem });
  }
  row({ name, secret, renew: RENEW.cloudflare, expires: m[2] === 'never' ? null : Date.parse(m[2]) || null, note: 'GitHub Actions secret, deploys the site (as of ' + run.created_at.slice(0, 10) + ')' });
}

export const tokenProblems = (status) => status.rows.filter((r) => r.problem).map((r) => r.problem);

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
