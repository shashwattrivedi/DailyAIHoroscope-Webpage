// Counts the posts that use #DailyAIHoroscopeWasCorrect on each platform and publishes
// them as data/stats.json in R2, which the purpose page reads ("Read stories").
//
// Each platform returns the posts it can see right now ({ id, time }). Most only show a
// recent window, so every post id seen is kept in KV (stats:seen:<platform>) and the
// count is the number of different posts ever seen: it never drops. A platform that
// can't be counted (no API or no keys) is null, shown as "—" on the page.

const TAG = 'DailyAIHoroscopeWasCorrect';
const WEEK = 7 * 86400000;

const LINKS = {
  bluesky: 'https://bsky.app/hashtag/' + TAG,
  instagram: 'https://www.instagram.com/explore/tags/' + TAG.toLowerCase() + '/',
  x: 'https://x.com/hashtag/' + TAG,
  reddit: 'https://www.reddit.com/search/?q=%23' + TAG,
  facebook: 'https://www.facebook.com/hashtag/' + TAG.toLowerCase()
};

// Bluesky's search is public. Our own account's posts don't count.
async function bluesky(env) {
  const own = String(env.BLUESKY_HANDLE || '').trim().replace(/^@/, '').toLowerCase();
  const out = [];
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const res = await fetch('https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=' + encodeURIComponent('#' + TAG) + '&limit=100' +
      (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    if (!res.ok) throw new Error('Bluesky search: HTTP ' + res.status);
    const r = await res.json();
    for (const p of r.posts || []) if (p.author.handle.toLowerCase() !== own) out.push({ id: p.uri, time: Date.parse(p.record.createdAt || p.indexedAt) });
    if (!r.cursor || !(r.posts || []).length) break;
    cursor = r.cursor;
  }
  return out;
}

// Instagram hashtag search (Graph API). Meta may require the app to be approved for
// public content first; until then this fails and the page shows "—". It only lists
// the last 24 hours, so the running total does the rest. Our own posts don't count.
async function instagram(env) {
  if (!env.INSTAGRAM_USER_ID || !env.META_PAGE_TOKEN) return null;
  const g = (path) => fetch('https://graph.facebook.com/' + (env.META_GRAPH_VERSION || 'v23.0') + '/' + path +
    (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(env.META_PAGE_TOKEN)).then(async (res) => {
    const body = await res.json();
    if (!res.ok || body.error) throw new Error('Instagram ' + path.split('?')[0] + ': ' + (body.error ? body.error.message : 'HTTP ' + res.status));
    return body;
  });
  const user = env.INSTAGRAM_USER_ID;
  const tag = (await g('ig_hashtag_search?user_id=' + user + '&q=' + TAG.toLowerCase())).data[0];
  if (!tag) return [];
  const own = new Set(((await g(user + '/media?fields=id&limit=100')).data || []).map((m) => m.id));
  const media = (await g(tag.id + '/recent_media?user_id=' + user + '&fields=id,timestamp&limit=50')).data || [];
  return media.filter((m) => !own.has(m.id)).map((m) => ({ id: m.id, time: Date.parse(m.timestamp) }));
}

// X needs a paid API plan to search, Facebook has no hashtag search, and Reddit needs
// its keys (REDDIT_*); add a collector here when one becomes available.
const COLLECT = { bluesky, instagram, x: null, reddit: null, facebook: null };

export async function updateStats(env, now = Date.now()) {
  const platforms = {};
  let total = 0, week = 0;
  for (const [name, collect] of Object.entries(COLLECT)) {
    const key = 'stats:seen:' + name;
    const seen = (await env.HOROSCOPES.get(key, 'json')) || {};
    let ok = false;
    if (collect) {
      try {
        const posts = await collect(env);
        if (posts) {
          posts.forEach((p) => { seen[p.id] = p.time || now; });
          await env.HOROSCOPES.put(key, JSON.stringify(seen));
          ok = true;
        }
      } catch (e) {
        console.log('[stats] ' + name + ': ' + e.message);
      }
    }
    const times = Object.values(seen);
    // A platform we have counted before keeps its count if it fails this time.
    if (!ok && !times.length) { platforms[name] = { count: null, link: LINKS[name] }; continue; }
    const p = { count: times.length, week: times.filter((t) => now - t < WEEK).length, link: LINKS[name] };
    platforms[name] = p;
    total += p.count;
    week += p.week;
  }
  const stats = { tag: TAG, updated: new Date(now).toISOString(), total, week, platforms };
  await env.DATA.put('data/stats.json', JSON.stringify(stats), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=600' }
  });
  console.log('[stats] ' + JSON.stringify({ total, week, ...Object.fromEntries(Object.entries(platforms).map(([k, v]) => [k, v.count])) }));
  return stats;
}
