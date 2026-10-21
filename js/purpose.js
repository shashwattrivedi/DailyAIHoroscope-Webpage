(function () {
  const $ = (id) => document.getElementById(id);
  const picked = {};

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

  // Posts with the hashtag per platform, counted by the Worker (worker/src/stats.js).
  // A platform it can't count shows "—"; without the file the block stays hidden.
  const PLATFORMS = [['bluesky', 'Bluesky'], ['instagram', 'Instagram'], ['x', 'X'], ['facebook', 'Facebook'], ['reddit', 'Reddit']];
  async function loadStats() {
    const base = (document.querySelector('meta[name="horoscope-data"]') || {}).content;
    if (!base) return;
    let st;
    try {
      const res = await fetch(base + '/data/stats.json');
      if (!res.ok) return;
      st = await res.json();
    } catch (e) { return; }
    $('tallyHead').textContent = st.total > 0
      ? st.total + (st.total === 1 ? ' story' : ' stories') + ' shared so far' + (st.week ? ', ' + st.week + ' this week' : '') + '.'
      : 'No stories yet. Be the first to share one.';
    const list = $('tallyList');
    list.innerHTML = '';
    PLATFORMS.forEach(([key, name]) => {
      const p = (st.platforms || {})[key];
      if (!p) return;
      const li = document.createElement('li'), a = document.createElement('a'), b = document.createElement('b');
      a.href = p.link;
      a.rel = 'noopener';
      b.textContent = p.count == null ? '—' : p.count;
      a.append(name + ' ', b);
      a.title = p.count == null ? 'Not counted yet; read the posts on ' + name : p.count + ' on ' + name;
      li.append(a);
      list.append(li);
    });
    $('tallyTime').textContent = 'UPDATED ' + new Date(st.updated).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
    $('tally').hidden = false;
  }

  const today = localDate(new Date());
  const baked = bakedLines(today);
  renderLines(baked || {});
  if (!baked) fetchHoroscope(today).then(renderLines);
  loadTweets();
  loadStats();
})();
