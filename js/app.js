import { SOCIAL_LINKS, followLinks } from './social-links.js';

(function () {
  const C = window.CONSTELLATIONS;
  const BODIES = [['Sun', '☉︎'], ['Moon', '☽︎'], ['Mercury', '☿︎'], ['Venus', '♀︎'], ['Mars', '♂︎'], ['Jupiter', '♃︎'], ['Saturn', '♄︎'], ['Uranus', '⛢︎'], ['Neptune', '♆︎']];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const STORE = 'dah.sign';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);

  const els = {
    app: $('app'), dust: $('dust'), sky: $('sky'), tip: $('tip'), tipText: $('tipText'),
    chips: $('chips'), finder: $('finder'), barDates: $('barDates'), barName: $('barName'),
    dots: $('dots'), prev: $('prev'), next: $('next'), gap: $('gap'), card: $('card'),
    born: $('born'), signName: $('signName'), datePill: $('datePill'),
    quote: $('quote'), actions: $('actions'), shareLabel: $('shareLabel'),
    sheet: $('sheet'), tiles: $('tiles'), openSheet: $('openSheet')
  };
  document.querySelector('.follow-icons').innerHTML = followLinks();
  const widgetLinks = [$('getWidget'), $('sheetWidget')];
  widgetLinks.forEach((a) => {
    a.dataset.base = a.getAttribute('href');
    a.addEventListener('click', () => track('widget_click', { from: a.dataset.from }));
  });

  let now = new Date();
  // Lines for the visitor's own calendar date; null while loading.
  let lines = bakedLines(localDate(now));
  // Set on the sign pages (/aries …) by the daily build.
  const pageSign = SIGNS.findIndex((s) => s.key === els.app.dataset.sign);
  let started = false;

  const state = { sel: initialSign(), focus: null, sky: [], px: 0, py: 0 };

  function initialSign() {
    if (pageSign >= 0) return pageSign;
    try {
      const k = localStorage.getItem(STORE);
      const i = SIGNS.findIndex((s) => s.key === k);
      if (i >= 0) return i;
    } catch (e) {}
    return signIndex(now.getMonth() + 1, now.getDate());
  }

  function remember() {
    try { localStorage.setItem(STORE, SIGNS[state.sel].key); } catch (e) {}
  }

  function lineFor(i) {
    return lines[dataKey(SIGNS[i])] || 'Today’s lines are still being written. Check back in a minute.';
  }

  // Everyone sees the lines for their own date: a new set appears at local midnight.
  async function loadDay() {
    const date = localDate(now);
    const got = await fetchHoroscope(date);
    if (date !== localDate(now)) return;
    lines = got;
    cards.clear();
    renderText();
    fitQuote();
    // Planets are placed around the text, so re-place them if the sky is already up.
    if (started) renderSky(false);
  }

  function setDate() {
    els.datePill.textContent = DAYS[now.getDay()] + ' ' + now.getDate() + ' ' + MONTHS[now.getMonth()];
  }

  // Roll over at local midnight, also after the tab or phone wakes up.
  let midnightT = 0;
  function watchMidnight() {
    clearTimeout(midnightT);
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    midnightT = setTimeout(checkDate, Math.min(next - Date.now(), 2147483647));
  }
  function checkDate() {
    const t = new Date();
    if (localDate(t) !== localDate(now)) {
      now = t;
      lines = null;
      setDate();
      state.sky = computeSky(now);
      state.focus = null;
      started = false;
      buildLists();
      renderText();
      loadDay().then(() => { started = true; renderSky(true); });
    }
    watchMidnight();
  }

  // Where each planet is today: its real constellation (IAU boundaries) and ecliptic position.
  function computeSky(date) {
    const A = window.Astronomy;
    if (!A) return [];
    const obs = new A.Observer(0, 0, 0);
    return BODIES.map(([name, glyph]) => {
      const eq = A.Equator(name, date, obs, false, true);
      const con = A.Constellation(eq.ra, eq.dec);
      const ec = A.Ecliptic(A.GeoVector(name, date, true));
      return { name, glyph, con: con.symbol, conName: con.name, lon: ec.elon, lat: ec.elat };
    });
  }

  const planetsIn = (i) => state.sky.filter((b) => b.con === SIGNS[i].iau);

  // Draw order for the build animation: start at a star, draw each line outward from a
  // star that is already lit, light the far star when the line reaches it.
  function sequence(c) {
    const nodes = c.s.map((s) => ({ x: s[0], y: s[1] }));
    const nodeAt = (x, y) => {
      let best = -1, bd = 1e9;
      nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = i; } });
      if (bd < 70) return best;
      nodes.push({ x, y });
      return nodes.length - 1;
    };
    const edges = c.l.map((l) => ({ a: nodeAt(l[0], l[1]), b: nodeAt(l[2], l[3]), l }));
    const adj = nodes.map(() => []);
    edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
    const DUR = 450;
    const time = {}, used = new Set(), lines = [];
    let end = 0;
    const run = (start, t0) => {
      time[start] = t0;
      const q = [start];
      while (q.length) {
        const n = q.shift();
        adj[n].forEach((ei) => {
          if (used.has(ei)) return;
          used.add(ei);
          const e = edges[ei], fwd = e.a === n, o = fwd ? e.b : e.a, l = e.l;
          const p = fwd ? l : [l[2], l[3], l[0], l[1]];
          lines.push({ p, delay: time[n] });
          end = Math.max(end, time[n] + DUR);
          if (time[o] === undefined) { time[o] = time[n] + DUR; q.push(o); }
        });
      }
    };
    edges.forEach((e) => { if (time[e.a] === undefined && time[e.b] === undefined) run(e.a, end ? end + 150 : 250); });
    const stars = c.s.map((s, i) => ({ s, delay: time[i] !== undefined ? time[i] : end + 200 + (i * 70) % 900 }));
    return { stars, lines, dur: DUR, end: end + 900 };
  }

  function seeded(n, w, h) {
    let s = 7;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: n }, () => ({ x: r() * w, y: r() * h, r: 0.6 + r() * 1.4, o: 0.35 + r() * 0.6, d: r() * 4 }));
  }

  // ---------- Layout ----------

  const isDesktop = () => window.matchMedia('(min-width: 900px) and (min-height: 560px)').matches;
  let box = { x: 0, y: 0, w: 1, h: 1 };

  function rel(el) {
    const a = els.app.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { top: r.top - a.top, bottom: r.bottom - a.top, left: r.left - a.left, right: r.right - a.left };
  }

  // Long names (Sagittarius, Capricorn) shrink to fit the width.
  function fitName() {
    const h1 = els.signName;
    h1.style.fontSize = '';
    const max = parseFloat(getComputedStyle(h1).fontSize);
    const cs = getComputedStyle(els.card);
    const inner = els.card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (h1.scrollWidth > inner) h1.style.fontSize = Math.max(28, Math.floor(max * inner / h1.scrollWidth)) + 'px';
  }

  // Shrink the line until the sky keeps enough room (nothing ever scrolls).
  function fitQuote() {
    fitName();
    const H = els.app.clientHeight;
    const desk = isDesktop();
    const max = desk ? 52 : 34, min = 15;
    const minGap = desk ? 24 : Math.min(170, H * 0.2);
    let size = max;
    els.quote.style.fontSize = size + 'px';
    while (size > min && els.gap.offsetHeight < minGap) {
      size -= 2;
      els.quote.style.fontSize = size + 'px';
    }
    els.quote.style.lineHeight = size > 30 ? '' : '1.18';
  }

  function layout() {
    const W = els.app.clientWidth, H = els.app.clientHeight;
    fitQuote();
    box = isDesktop()
      ? { x: 0.39 * W, y: 0.045 * H, w: 0.625 * W, h: Math.max(1, Math.min(0.91 * H, rel($('followRow')).top - 0.045 * H - 40)) }
      : { x: -0.1 * W, y: 0.07 * H, w: 1.2 * W, h: 0.76 * H };
    Object.assign(els.sky.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' });
    const field = seeded(Math.min(160, Math.round((W * H) / 5500)), W, H);
    els.dust.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    els.dust.innerHTML = '<g fill="#FFFFFF">' + field.map((f) =>
      '<circle class="fs" cx="' + f.x.toFixed(1) + '" cy="' + f.y.toFixed(1) + '" r="' + f.r.toFixed(2) + '" style="animation-delay:' + f.d.toFixed(2) + 's;opacity:' + f.o.toFixed(2) + '"></circle>').join('') + '</g>';
    renderSky(false);
  }

  // Area (app coordinates) where planets may sit without covering text.
  function safeZone() {
    const W = els.app.clientWidth;
    const card = rel(els.card);
    if (isDesktop()) {
      const chips = rel(els.chips), actions = rel(els.actions), follow = rel($('followRow'));
      return { x: [card.right + 40, W - 60], y: [chips.bottom + 70, Math.min(actions.top, follow.top) - 40], tipTop: chips.bottom + 12 };
    }
    const finder = rel(els.finder);
    return { x: [36, W - 36], y: [finder.bottom + 80, card.top - 28], tipTop: finder.bottom + 12 };
  }

  // ---------- Rendering ----------

  function renderSky(animate) {
    const sign = SIGNS[state.sel];
    const c = C[sign.key];
    const seq = sequence(c);
    const t = (ms) => (animate && !reduceMotion ? ms : 0);
    const lines = seq.lines.map((l) =>
      '<line class="ln" pathLength="1" x1="' + l.p[0] + '" y1="' + l.p[1] + '" x2="' + l.p[2] + '" y2="' + l.p[3] + '" style="animation-delay:' + t(l.delay) + 'ms;animation-duration:' + (animate ? seq.dur : 1) + 'ms"></line>').join('');
    const stars = seq.stars.map((x) =>
      '<circle class="st" cx="' + x.s[0] + '" cy="' + x.s[1] + '" r="' + (x.s[2] * 1.25) + '" style="animation-delay:' + t(x.delay) + 'ms,' + (t(x.delay) + 1500) + 'ms"></circle>').join('');
    els.sky.innerHTML =
      '<svg role="img" aria-label="' + sign.name + ' constellation" viewBox="' + c.vb.join(' ') + '" preserveAspectRatio="xMidYMid meet">' +
      '<g stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round" fill="none">' + lines + '</g>' +
      '<g fill="#FFFFFF" class="glow">' + stars + '</g></svg>';

    // Planets: spread along the constellation's ecliptic span, kept inside the safe zone.
    const [vx, vy, vw, vh] = c.vb;
    const k = Math.min(box.w / vw, box.h / vh);
    const ox = (box.w - vw * k) / 2, oy = (box.h - vh * k) / 2;
    const z = safeZone();
    const clamp = (v, r) => (r[0] > r[1] ? (r[0] + r[1]) / 2 : Math.max(r[0], Math.min(r[1], v)));
    planetsIn(state.sel).forEach((b, j) => {
      let lon = b.lon;
      if (lon < sign.span[0]) lon += 360;
      const f = Math.max(0, Math.min(1, (lon - sign.span[0]) / (sign.span[1] - sign.span[0])));
      const x = clamp(box.x + ox + vw * (0.88 - 0.76 * f) * k, z.x) - box.x;
      const y = clamp(box.y + oy + (vh / 2 - b.lat * (vh / 30)) * k, z.y) - box.y;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'planet';
      btn.style.left = x.toFixed(1) + 'px';
      btn.style.top = y.toFixed(1) + 'px';
      btn.style.animationDelay = t(seq.end + j * 150) + 'ms';
      btn.setAttribute('aria-label', b.name + ' in ' + b.conName + ' today');
      btn.setAttribute('aria-pressed', state.focus === b.name ? 'true' : 'false');
      btn.innerHTML = '<span class="ring" aria-hidden="true"></span><span class="disc" aria-hidden="true">' + b.glyph + '</span>';
      btn.addEventListener('click', () => setFocus(state.focus === b.name ? null : b.name));
      els.sky.appendChild(btn);
    });
    renderTip();
  }

  function setFocus(name) {
    state.focus = name;
    els.sky.querySelectorAll('.planet').forEach((p) => {
      p.setAttribute('aria-pressed', p.getAttribute('aria-label').startsWith(name + ' ') ? 'true' : 'false');
    });
    renderTip();
  }

  function renderTip() {
    const b = state.sky.find((x) => x.name === state.focus);
    if (!b) { els.tip.hidden = true; return; }
    const z = safeZone();
    els.tipText.textContent = b.glyph + ' ' + b.name + ' is in ' + b.conName + ' today';
    els.tip.style.top = z.tipTop + 'px';
    els.tip.style.left = (isDesktop() ? (z.x[0] + z.x[1]) / 2 : els.app.clientWidth / 2) + 'px';
    els.tip.hidden = false;
  }

  const colourEls = document.querySelectorAll('.date-pill, .all-signs, .share, .chips');
  function renderText() {
    const s = SIGNS[state.sel];
    // The sign's colour goes only where it's used: --bg on the root would make the browser
    // restyle all ~550 elements (dust, pickers, tiles) on every switch.
    [document.documentElement, document.body].forEach((e) => (e.style.background = s.color));
    colourEls.forEach((e) => e.style.setProperty('--bg', s.color));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', s.color);
    els.barDates.textContent = 'BORN ' + s.dates + '?';
    els.barName.textContent = 'You’re a ' + s.name;
    els.born.textContent = 'BORN ' + s.dates;
    els.signName.textContent = s.name;
    els.prev.setAttribute('aria-label', 'Previous sign, ' + SIGNS[(state.sel + 11) % 12].name);
    els.next.setAttribute('aria-label', 'Next sign, ' + SIGNS[(state.sel + 1) % 12].name);
    els.quote.textContent = lines ? '“' + lineFor(state.sel) + '”' : '';
    // Restarts the rise without making the browser lay out the page first (a class swap
    // needs a forced layout in between, which made every sign switch slower).
    if (lines && !reduceMotion && els.quote.animate) {
      els.quote.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
        { duration: 600, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
    }
    els.dots.querySelectorAll('span').forEach((d, i) => d.classList.toggle('on', i === state.sel));
    els.chips.querySelectorAll('.chip').forEach((c, i) => c.setAttribute('aria-pressed', i === state.sel ? 'true' : 'false'));
    els.tiles.querySelectorAll('.tile').forEach((c, i) => c.setAttribute('aria-pressed', i === state.sel ? 'true' : 'false'));
    els.shareLabel.textContent = 'Felt the same? Share it';
    // The widget page opens on the sign shown here.
    widgetLinks.forEach((a) => { a.href = a.dataset.base + '?sign=' + signSlug(s); });
    if (lines) prewarm();
  }

  function buildLists() {
    els.dots.innerHTML = SIGNS.map(() => '<span></span>').join('');
    els.chips.innerHTML = '';
    els.tiles.innerHTML = '';
    SIGNS.forEach((s, i) => {
      const here = planetsIn(i);
      const aria = s.name + (here.length ? ', with ' + here.map((b) => b.name).join(' and ') + ' today' : '');
      const glyphs = here.map((b) => b.glyph).join('');

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('aria-label', aria);
      chip.innerHTML = '<span aria-hidden="true">' + s.glyph + '</span> ' + s.name + '<span class="pl" aria-hidden="true">' + glyphs + '</span>';
      chip.addEventListener('click', () => { select(i); remember(); });
      els.chips.appendChild(chip);

      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.style.setProperty('--c', s.color);
      tile.setAttribute('aria-label', aria + ', born ' + s.dates.toLowerCase());
      const short = s.dates.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
      tile.innerHTML = '<span class="tile-top" aria-hidden="true"><span>' + s.glyph + '</span><span>' + glyphs + '</span></span>' +
        '<span class="tile-name">' + s.name + '</span><span class="tile-dates">' + short + '</span>';
      tile.addEventListener('click', () => { select(i); remember(); closeSheet(); });
      els.tiles.appendChild(tile);
    });
  }

  // Sends a Google Analytics event (js/analytics.js); nothing if it didn't load.
  const track = (name, params) => window.track && window.track(name, params);

  function select(i) {
    if (i === state.sel) return;
    state.sel = i;
    track('select_sign', { sign: SIGNS[i].name });
    state.focus = null;
    // On a sign page, keep the address and title in step with the sign shown.
    if (pageSign >= 0) {
      history.replaceState(null, '', signSlug(SIGNS[i]) + (location.pathname.endsWith('.html') ? '.html' : ''));
      document.title = SIGNS[i].name + ' horoscope today · Daily AI Horoscope';
    }
    renderText();
    fitQuote();
    skySoon();
  }

  // The new line and colour paint first; the constellation is drawn just after that
  // frame, so a tap shows its result straight away. Quick taps draw only the last sign.
  let skyFrame = 0, skyT = 0;
  function skySoon() {
    cancelAnimationFrame(skyFrame);
    clearTimeout(skyT);
    skyFrame = requestAnimationFrame(() => { skyT = setTimeout(() => renderSky(true)); });
  }

  // ---------- Birthday finder ----------

  const birthday = { m: '', d: '' };
  const pickers = [[$('sheetMonth'), $('sheetDay')], [$('deskMonth'), $('deskDay')]];

  function fillPickers() {
    const months = '<option value="">Month</option>' + MONTH_NAMES.map((m, i) => '<option value="' + (i + 1) + '">' + m + '</option>').join('');
    const days = '<option value="">Day</option>' + Array.from({ length: 31 }, (_, i) => '<option value="' + (i + 1) + '">' + (i + 1) + '</option>').join('');
    pickers.forEach(([m, d]) => {
      m.innerHTML = months;
      d.innerHTML = days;
      m.addEventListener('change', () => pickBirthday(m.value, birthday.d));
      d.addEventListener('change', () => pickBirthday(birthday.m, d.value));
    });
  }

  function pickBirthday(m, d) {
    birthday.m = m;
    birthday.d = d;
    pickers.forEach(([ms, ds]) => { ms.value = m; ds.value = d; });
    if (m && d) {
      select(signIndex(+m, +d));
      remember();
    }
  }

  // ---------- Sheet ----------

  function openSheet() {
    els.sheet.hidden = false;
    // The sheet starts below the screen; a plain focus() would scroll the layout to it.
    $('closeSheet').focus({ preventScroll: true });
  }

  function closeSheet() {
    if (els.sheet.hidden) return;
    els.sheet.hidden = true;
    els.openSheet.focus({ preventScroll: true });
  }

  // ---------- Motion: cursor, tilt, swipe ----------

  let raf = 0;
  function applyParallax() {
    raf = 0;
    const { px, py } = state;
    els.sky.style.transform = 'translate(' + px * -26 + 'px,' + py * -26 + 'px) rotate(' + px * 2.5 + 'deg)';
    els.dust.style.transform = 'translate(' + px * 10 + 'px,' + py * 10 + 'px)';
    els.quote.style.transform = 'translate(' + px * 4 + 'px,' + py * 4 + 'px)';
  }
  function setTilt(px, py) {
    if (reduceMotion) return;
    state.px = Math.max(-1, Math.min(1, px));
    state.py = Math.max(-1, Math.min(1, py));
    if (!raf) raf = requestAnimationFrame(applyParallax);
  }

  let down = null, askedTilt = false;
  els.app.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    setTilt((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
  });
  document.addEventListener('pointerleave', () => setTilt(0, 0));
  els.app.addEventListener('pointerdown', (e) => {
    down = els.sheet.hidden && !e.target.closest('select') ? [e.clientX, e.clientY] : null;
    // iOS only allows motion access after a tap.
    if (!askedTilt && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      askedTilt = true;
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }
  });
  els.app.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down[0], dy = e.clientY - down[1];
    down = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 60) select((state.sel + (dx < 0 ? 1 : 11)) % 12);
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    setTilt(e.gamma / 25, (e.beta - 45) / 25);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); setFocus(null); return; }
    if (!els.sheet.hidden || e.target.closest('select, input, textarea')) return;
    if (e.key === 'ArrowRight') select((state.sel + 1) % 12);
    if (e.key === 'ArrowLeft') select((state.sel + 11) % 12);
  });

  // ---------- Share and save ----------

  const SITE = location.protocol.startsWith('http') ? location.origin : 'https://dailyaihoroscope.com';

  function flash(text) {
    els.shareLabel.textContent = text;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { els.shareLabel.textContent = 'Felt the same? Share it'; }, 2400);
  }

  function followPrompt() {
    const label = $('followPrompt');
    label.textContent = "Follow for tomorrow's line";
    $('followRow').classList.add('prompting');
    clearTimeout(followPrompt.t);
    followPrompt.t = setTimeout(() => { label.textContent = 'Follow'; $('followRow').classList.remove('prompting'); }, 2400);
  }

  // The card image is drawn ahead of time so sharing starts straight from the tap
  // (Safari drops navigator.share if it waits too long after the gesture).
  const cards = new Map();
  function cardFor(sel) {
    if (!cards.has(sel)) cards.set(sel, drawCard(sel).then((blob) => (cards.get(sel).blob = blob)));
    return cards.get(sel);
  }
  function cardFile(blob, sel) {
    return new File([blob], 'daily-ai-horoscope-' + SIGNS[sel].key + '.png', { type: 'image/png' });
  }
  let prewarmT = 0;
  function prewarm() {
    clearTimeout(prewarmT);
    // Only for a sign the visitor stays on, and when the page is idle, so drawing the card
    // never delays the next tap.
    prewarmT = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => cardFor(state.sel)), 1500);
  }

  function download(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function share() {
    if (!lines) return;
    const sel = state.sel;
    track('share', { sign: SIGNS[sel].name });
    const text = SIGNS[sel].name + ' today: “' + lineFor(sel) + '” #DailyAIHoroscopeWasCorrect';
    const url = SITE + '/' + signSlug(SIGNS[sel]);
    const card = cardFor(sel);
    const file = cardFile(card.blob || (await card), sel);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Daily AI Horoscope', text: text + ' ' + url }); followPrompt(); return; } catch (e) { if (e.name === 'AbortError') return; }
    } else if (navigator.share) {
      try { await navigator.share({ title: 'Daily AI Horoscope', text, url }); followPrompt(); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    // No share sheet: copy the text and save the image so both can be posted.
    let copied = false;
    try { await navigator.clipboard.writeText(text + ' ' + url); copied = true; } catch (e) {}
    download(file);
    flash(copied ? 'Text copied, image saved' : 'Image saved');
    followPrompt();
  }

  function wrap(ctx, text, maxW) {
    const words = text.split(' '), out = [];
    let line = '';
    words.forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    });
    if (line) out.push(line);
    return out;
  }

  function drawSocialIcon(ctx, platform, x, y, size, color) {
    const k = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (platform === 'instagram') {
      ctx.beginPath(); ctx.roundRect(3, 3, 18, 18, 5); ctx.stroke();
      ctx.beginPath(); ctx.arc(12, 12, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(17.5, 6.5, 1, 0, Math.PI * 2); ctx.fill();
    } else if (platform === 'facebook') {
      ctx.beginPath(); ctx.moveTo(15, 21); ctx.lineTo(15, 13); ctx.lineTo(18, 13);
      ctx.lineTo(18.5, 9); ctx.lineTo(15, 9); ctx.lineTo(15, 7);
      ctx.bezierCurveTo(15, 5.8, 15.4, 5, 17, 5); ctx.lineTo(18.7, 5);
      ctx.lineTo(18.7, 1.4); ctx.bezierCurveTo(17.9, 1.2, 16.8, 1, 15.5, 1);
      ctx.bezierCurveTo(12.3, 1, 10, 2.9, 10, 6.5); ctx.lineTo(10, 9);
      ctx.lineTo(7, 9); ctx.lineTo(7, 13); ctx.lineTo(10, 13); ctx.lineTo(10, 21);
      ctx.closePath(); ctx.fill();
    } else if (platform === 'bluesky') {
      ctx.beginPath(); ctx.moveTo(12, 12);
      ctx.bezierCurveTo(9, 8, 4.4, 4.2, 2.7, 5.1);
      ctx.bezierCurveTo(1.1, 5.9, 2.2, 10.5, 4.2, 12.3);
      ctx.bezierCurveTo(5.8, 13.8, 8.2, 13.9, 12, 12);
      ctx.bezierCurveTo(8.2, 13.9, 6.8, 15.7, 7.4, 17.6);
      ctx.bezierCurveTo(8, 19.4, 10, 19.4, 12, 15.5);
      ctx.bezierCurveTo(14, 19.4, 16, 19.4, 16.6, 17.6);
      ctx.bezierCurveTo(17.2, 15.7, 15.8, 13.9, 12, 12);
      ctx.bezierCurveTo(15.8, 13.9, 18.2, 13.8, 19.8, 12.3);
      ctx.bezierCurveTo(21.8, 10.5, 22.9, 5.9, 21.3, 5.1);
      ctx.bezierCurveTo(19.6, 4.2, 15, 8, 12, 12);
      ctx.fill();
    }
    ctx.restore();
  }

  // 1080x1350 card for stories and feeds.
  async function drawCard(sel) {
    const s = SIGNS[sel], c = C[s.key];
    const W = 1080, H = 1350, P = 80;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    try { await Promise.all(['800 40px Outfit', '900 160px Outfit', '700 28px "Space Mono"'].map((f) => document.fonts.load(f))); } catch (e) {}

    ctx.fillStyle = s.color;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FFFFFF';
    seeded(90, W, H).forEach((f) => { ctx.globalAlpha = f.o; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.6, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;

    const [vx, vy, vw, vh] = c.vb;
    const area = { x: 40, y: 150, w: W - 80, h: 640 };
    const k = Math.min(area.w / vw, area.h / vh);
    const ox = area.x + (area.w - vw * k) / 2 - vx * k, oy = area.y + (area.h - vh * k) / 2 - vy * k;
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = Math.max(2, 3 * k);
    ctx.lineCap = 'round';
    c.l.forEach((l) => { ctx.beginPath(); ctx.moveTo(ox + l[0] * k, oy + l[1] * k); ctx.lineTo(ox + l[2] * k, oy + l[3] * k); ctx.stroke(); });
    c.s.forEach((p) => { ctx.beginPath(); ctx.arc(ox + p[0] * k, oy + p[1] * k, Math.max(3, p[2] * 1.25 * k), 0, 7); ctx.fill(); });
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#111111';
    ctx.textBaseline = 'top';
    ctx.font = '800 40px Outfit';
    ctx.fillText('Daily AI Horoscope', P, P - 10);
    const date = DAYS[now.getDay()] + ' ' + now.getDate() + ' ' + MONTHS[now.getMonth()];
    ctx.font = '700 28px "Space Mono"';
    const dw = ctx.measureText(date).width + 44;
    ctx.beginPath(); ctx.roundRect(W - P - dw, P - 16, dw, 56, 28); ctx.fill();
    ctx.fillStyle = s.color;
    ctx.fillText(date, W - P - dw + 22, P - 2);

    const planets = planetsIn(sel);
    if (planets.length) {
      ctx.font = '700 30px Outfit';
      let x = P;
      planets.forEach((b) => {
        ctx.fillStyle = '#111111';
        ctx.beginPath(); ctx.arc(x + 30, 760, 30, 0, 7); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.glyph, x + 30, 762);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111111';
        ctx.fillText(b.name + ' is here today', x + 76, 762);
        x += 76 + ctx.measureText(b.name + ' is here today').width + 40;
      });
      ctx.textBaseline = 'top';
    }

    ctx.fillStyle = '#111111';
    ctx.font = '700 28px "Space Mono"';
    ctx.fillText('BORN ' + s.dates, P, 830);
    let nameSize = 150;
    ctx.font = '900 150px Outfit';
    while (ctx.measureText(s.name).width > W - P * 2 && nameSize > 60) ctx.font = '900 ' + (nameSize -= 4) + 'px Outfit';
    ctx.fillText(s.name, P - 6, 868 + (150 - nameSize) * 0.6);

    const text = '“' + lineFor(sel) + '”';
    let size = 60, lines;
    do {
      ctx.font = '800 ' + size + 'px Outfit';
      lines = wrap(ctx, text, W - P * 2);
      size -= 2;
    } while (lines.length * (size + 2) * 1.1 > 260 && size > 26);
    const lh = (size + 2) * 1.1;
    lines.forEach((l, i) => ctx.fillText(l, P, 1040 + i * lh));

    const footerY = H - P;
    let iconX = P;
    SOCIAL_LINKS.forEach(({ platform }) => {
      drawSocialIcon(ctx, platform, iconX, footerY, 26, '#111111');
      iconX += 34;
    });
    ctx.font = '700 26px "Space Mono"';
    ctx.fillText(SITE.replace(/^https?:\/\//, ''), iconX + 4, footerY);
    return new Promise((r) => cv.toBlob(r, 'image/png'));
  }

  async function save() {
    if (!lines) return;
    const sel = state.sel;
    track('save_card', { sign: SIGNS[sel].name });
    const card = cardFor(sel);
    const file = cardFile(card.blob || (await card), sel);
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file], title: 'Daily AI Horoscope' }); followPrompt(); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(file);
    followPrompt();
  }

  // ---------- Wire up ----------

  setDate();
  els.prev.addEventListener('click', () => select((state.sel + 11) % 12));
  els.next.addEventListener('click', () => select((state.sel + 1) % 12));
  els.openSheet.addEventListener('click', openSheet);
  $('closeSheet').addEventListener('click', closeSheet);
  $('scrim').addEventListener('click', closeSheet);
  $('tipClose').addEventListener('click', () => setFocus(null));
  $('share').addEventListener('click', share);
  $('save').addEventListener('click', save);
  $('followRow').addEventListener('click', (event) => {
    const link = event.target.closest('[data-platform]');
    if (link) track('follow_click', { platform: link.dataset.platform });
  });

  state.sky = computeSky(now);
  fillPickers();
  buildLists();
  renderText();
  const firstLoad = loadDay();
  watchMidnight();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDate(); });

  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(layout, 120); });

  const start = () => { layout(); started = true; renderSky(true); performance.mark('sky'); };
  Promise.all([
    document.fonts ? document.fonts.ready : null,
    Promise.race([firstLoad, new Promise((r) => setTimeout(r, 3000))])
  ]).then(start);
})();
