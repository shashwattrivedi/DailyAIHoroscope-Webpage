// The embeddable widget (widget.html). Reads ?sign= and ?theme= and shows that sign's
// line for the visitor's own date, or a sign picker when no sign is given.
(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const site = document.querySelector('meta[name="site"]').content;
  const bySlug = (v) => SIGNS.find((s) => signSlug(s) === String(v || '').toLowerCase() || s.key === String(v || '').toLowerCase());
  const fixed = bySlug(params.get('sign'));
  const theme = ['dark', 'light'].includes(params.get('theme')) ? params.get('theme') : 'color';
  document.documentElement.dataset.theme = theme;

  // Where the widget is shown, so the site's analytics can tell embeds apart.
  let host = 'direct';
  try { host = document.referrer ? new URL(document.referrer).hostname : 'direct'; } catch (e) {}
  const link = (path) => site + path + '?utm_source=widget&utm_medium=embed&utm_campaign=' + encodeURIComponent(host);
  $('brand').href = link('/');
  $('more').href = link('/');

  const now = new Date(), date = localDate(now);
  $('date').textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '').toUpperCase();

  let lines = null;
  const loading = fetchHoroscope(date).then((l) => (lines = l));

  const store = {
    get() { try { return localStorage.getItem('widget-sign'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem('widget-sign', v); } catch (e) {} }
  };

  // Largest font size at which the whole line fits the space left.
  function fit() {
    const box = $('box'), q = $('quote');
    let size = Math.min(30, Math.max(14, box.clientWidth / 11));
    q.style.fontSize = size + 'px';
    while (q.scrollHeight > box.clientHeight && size > 11) q.style.fontSize = (size -= 1) + 'px';
  }

  async function show(s) {
    $('pick').hidden = true;
    $('sign').hidden = $('box').hidden = false;
    $('change').hidden = !!fixed;
    $('note').hidden = !fixed;
    document.documentElement.style.setProperty('--bg', s.color);
    $('glyph').textContent = s.glyph;
    $('name').textContent = s.name;
    $('born').textContent = s.dates;
    $('more').textContent = 'Read more →';
    $('more').href = link('/' + signSlug(s));
    $('quote').textContent = '…';
    await loading;
    const line = lines && lines[dataKey(s)];
    $('quote').textContent = line ? '“' + line + '”' : 'Today’s line isn’t ready yet. Open the site to read all 12 signs.';
    fit();
  }

  function pick() {
    $('pick').hidden = false;
    $('sign').hidden = $('box').hidden = $('change').hidden = true;
    $('note').hidden = false;
    $('more').textContent = 'All 12 signs →';
    $('more').href = link('/');
    const grid = $('grid');
    if (!grid.children.length) SIGNS.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.setProperty('--c', s.color);
      b.setAttribute('aria-label', s.name);
      b.innerHTML = '<b></b><span class="mono"></span>';
      b.firstChild.textContent = s.glyph;
      b.lastChild.textContent = s.name.slice(0, 3).toUpperCase();
      b.addEventListener('click', () => { store.set(signSlug(s)); show(s); });
      grid.append(b);
    });
  }

  $('change').addEventListener('click', pick);
  addEventListener('resize', () => { if (!$('box').hidden) fit(); });
  const chosen = fixed || bySlug(store.get());
  if (chosen) show(chosen); else pick();
})();
