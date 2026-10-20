(function () {
  const $ = (id) => document.getElementById(id);
  const picked = {};

  // Today's lines live in index.html, where the daily job writes them.
  async function loadLines() {
    try {
      const res = await fetch('index.html', { cache: 'no-cache' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const el = doc.getElementById('horoscopeDataToday');
      if (el) return parseHoroscopeText(el.textContent);
    } catch (e) {}
    return {};
  }

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
      btn.lastChild.textContent = lines[dataKey(s)] || 'No horoscope available for today.';
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

  renderLines({});
  loadLines().then(renderLines);
  loadTweets();
})();
