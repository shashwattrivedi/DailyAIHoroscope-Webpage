// The /embed page: builds the widget's iframe snippet from the chosen options, with a
// live preview, and lists the RSS feeds.
(function () {
  const $ = (id) => document.getElementById(id);
  const SITE = 'https://dailyaihoroscope.com';
  const track = (name, params) => window.track && window.track(name, params);

  SIGNS.forEach((s) => $('sign').add(new Option(s.glyph + ' ' + s.name, signSlug(s))));

  const feeds = [['All 12 signs', 'feed.xml'], ...SIGNS.map((s) => [s.glyph + ' ' + s.name, 'feed/' + signSlug(s) + '.xml'])];
  feeds.forEach(([label, file]) => {
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = SITE + '/' + file;
    a.textContent = label;
    li.append(a);
    $('feeds').append(li);
  });

  function update() {
    const [w, h] = $('size').value.split('x');
    const q = new URLSearchParams();
    if ($('sign').value) q.set('sign', $('sign').value);
    if ($('theme').value !== 'color') q.set('theme', $('theme').value);
    const src = SITE + '/widget' + (q.toString() ? '?' + q : '');
    $('snippet').value = '<iframe src="' + src + '" width="' + w + '" height="' + h +
      '" style="border:0;border-radius:16px;max-width:100%" title="Today’s horoscope · Daily AI Horoscope" loading="lazy"></iframe>';
    const frame = $('preview');
    frame.width = w;
    frame.height = h;
    frame.src = 'widget' + (q.toString() ? '?' + q : '');
  }
  ['sign', 'theme', 'size'].forEach((id) => $(id).addEventListener('change', update));
  update();

  $('copy').addEventListener('click', async () => {
    const t = $('snippet');
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
    $('copy').textContent = 'Copied';
    setTimeout(() => ($('copy').textContent = 'Copy code'), 1600);
    track('copy_embed', { sign: $('sign').value || 'picker', theme: $('theme').value, size: $('size').value });
  });
})();
