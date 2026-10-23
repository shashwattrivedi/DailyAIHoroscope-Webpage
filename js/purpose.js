import { followLinks } from './social-links.js';

(function () {
  const $ = (id) => document.getElementById(id);
  const picked = {};
  document.querySelector('.foot-follow-icons').innerHTML = followLinks('foot-follow-icon');

  function renderLines(lines) {
    const box = $('lines');
    box.innerHTML = '';
    SIGNS.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'line';
      btn.style.setProperty('--c', s.color);
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = '<span class="line-sign"></span><span class="line-text"></span>';
      btn.firstChild.textContent = s.glyph + ' ' + s.name.toUpperCase();
      btn.lastChild.textContent = lines[dataKey(s)] || '…';
      btn.addEventListener('click', () => {
        picked[s.key] = !picked[s.key];
        btn.setAttribute('aria-pressed', picked[s.key] ? 'true' : 'false');
        update();
      });
      box.appendChild(btn);
    });
  }

  function update() {
    const n = Object.values(picked).filter(Boolean).length;
    $('count').textContent = n;
    const v = $('verdict');
    v.hidden = n < 2;
    v.textContent = 'You’re not ' + n + ' signs at once. Lines this vague fit almost anyone. That’s the Barnum effect.';
  }

  function loadTweets() {
    const ids = $('tweetIds').textContent.split(',').map((x) => x.trim()).filter(Boolean);
    if (!ids.length) return;
    const list = $('tweetList');
    ids.forEach((id) => {
      const q = document.createElement('blockquote');
      q.className = 'twitter-tweet';
      q.setAttribute('data-theme', 'dark');
      const a = document.createElement('a');
      a.href = 'https://twitter.com/user/status/' + id;
      q.appendChild(a);
      list.appendChild(q);
    });
    $('stories').hidden = false;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://platform.twitter.com/widgets.js';
    document.body.appendChild(s);
  }

  // "Read stories": the hashtag page on each platform, with the number of posts the
  // Worker has counted (worker/src/stats.js). A platform it can't count shows "—".
  async function loadStats() {
    const base = (document.querySelector('meta[name="horoscope-data"]') || {}).content;
    if (!base) return;
    let st;
    try {
      const res = await fetch(base + '/data/stats.json');
      if (!res.ok) return;
      st = await res.json();
    } catch (e) { return; }
    document.querySelectorAll('#read [data-count]').forEach((b) => {
      const p = (st.platforms || {})[b.dataset.count];
      b.textContent = !p || p.count == null ? '—' : p.count;
    });
    $('readTotal').textContent = st.total;
    $('readTotal').hidden = false;
    $('readTotal').title = st.total + (st.total === 1 ? ' story' : ' stories') + ' shared so far';
    $('readTime').textContent = 'UPDATED ' + new Date(st.updated).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
    $('readTime').hidden = false;
  }

  // Google Analytics events (js/analytics.js); nothing if it didn't load.
  const track = (name, params) => window.track && window.track(name, params);
  const read = $('read');
  read.addEventListener('toggle', () => { if (read.open) track('open_read_stories'); });
  read.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => track('read_stories', { platform: a.firstChild.textContent.trim() })));
  document.querySelector('.foot-follow-icons').addEventListener('click', (event) => {
    const link = event.target.closest('[data-platform]');
    if (link) track('follow_click', { platform: link.dataset.platform });
  });
  document.querySelector('.felt .btn.dark').addEventListener('click', () => track('share_story'));

  // Close the menu on Escape or a click elsewhere.
  document.addEventListener('click', (e) => { if (read.open && !read.contains(e.target)) read.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && read.open) { read.open = false; read.querySelector('summary').focus(); } });

  const today = localDate(new Date());
  const baked = bakedLines(today);
  renderLines(baked || {});
  if (!baked) fetchHoroscope(today).then(renderLines);
  loadTweets();
  loadStats();
})();
