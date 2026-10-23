// Shared by index.html and purpose.html.

// key (also the data key, capitalised), display name, glyph, birth dates, colour,
// IAU constellation symbol, ecliptic longitude span of the constellation (deg).
const SIGNS = [
  { key: 'aries', name: 'Aries', glyph: '♈︎', dates: 'MAR 21 – APR 19', color: '#FF7A59', iau: 'Ari', span: [28.7, 53.4] },
  { key: 'taurus', name: 'Taurus', glyph: '♉︎', dates: 'APR 20 – MAY 20', color: '#3DDC97', iau: 'Tau', span: [53.4, 90.4] },
  { key: 'gemini', name: 'Gemini', glyph: '♊︎', dates: 'MAY 21 – JUN 20', color: '#FFD23F', iau: 'Gem', span: [90.4, 118.2] },
  { key: 'cancer', name: 'Cancer', glyph: '♋︎', dates: 'JUN 21 – JUL 22', color: '#9AD4FF', iau: 'Cnc', span: [118.2, 138.1] },
  { key: 'leo', name: 'Leo', glyph: '♌︎', dates: 'JUL 23 – AUG 22', color: '#FFA62B', iau: 'Leo', span: [138.1, 174.2] },
  { key: 'virgo', name: 'Virgo', glyph: '♍︎', dates: 'AUG 23 – SEP 22', color: '#B5E48C', iau: 'Vir', span: [174.2, 218.0] },
  { key: 'libra', name: 'Libra', glyph: '♎︎', dates: 'SEP 23 – OCT 22', color: '#FF6BB5', iau: 'Lib', span: [218.0, 241.0] },
  { key: 'scorpius', name: 'Scorpio', glyph: '♏︎', dates: 'OCT 23 – NOV 21', color: '#9B87FF', iau: 'Sco', span: [241.0, 248.0] },
  { key: 'sagittarius', name: 'Sagittarius', glyph: '♐︎', dates: 'NOV 22 – DEC 21', color: '#FF9E7A', iau: 'Sgr', span: [266.3, 299.7] },
  { key: 'capricornus', name: 'Capricorn', glyph: '♑︎', dates: 'DEC 22 – JAN 19', color: '#A9B4C8', iau: 'Cap', span: [299.7, 327.5] },
  { key: 'aquarius', name: 'Aquarius', glyph: '♒︎', dates: 'JAN 20 – FEB 18', color: '#5ED3F3', iau: 'Aqr', span: [327.5, 351.6] },
  { key: 'pisces', name: 'Pisces', glyph: '♓︎', dates: 'FEB 19 – MAR 20', color: '#D49BFF', iau: 'Psc', span: [351.6, 388.7] }
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Sign by calendar date (Aries starts Mar 21). Returns an index into SIGNS.
function signIndex(m, d) {
  const md = m * 100 + d;
  if (md < 120 || md >= 1222) return 9;
  if (md < 219) return 10;
  if (md < 321) return 11;
  let i = 0;
  [321, 420, 521, 621, 723, 823, 923, 1023, 1122].forEach((v, k) => { if (md >= v) i = k; });
  return i;
}

// Key used by the API: Aries … Scorpius, Capricornus …
function dataKey(sign) {
  return sign.key.charAt(0).toUpperCase() + sign.key.slice(1);
}

// Page address for a sign: /aries … /scorpio, /capricorn …
const signSlug = (sign) => sign.name.toLowerCase();

const localDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// The daily build writes the lines into the page itself (#baked) for every date that is
// "today" somewhere, so visitors in any timezone need no request (and crawlers and link
// previews see them). Returns this date's lines if they are there.
function bakedLines(date) {
  try {
    const b = JSON.parse(document.getElementById('baked').textContent);
    if (b.signs) return b.date === date ? b.signs : null; // older pages: { date, signs }
    return b[date] || null;
  } catch (e) {}
  return null;
}

// Otherwise the day's lines are a static file on the CDN (horoscope-data, published by
// the Worker once the date starts). The Worker API is only the fallback.
// Marks when the lines arrived and from where (lines:baked, lines:cdn, lines:api) for
// timing.js.
async function fetchHoroscope(date) {
  const got = (from, signs) => { try { performance.mark('lines:' + from); } catch (e) {} return signs; };
  const baked = bakedLines(date);
  if (baked) return got('baked', baked);
  const meta = (name) => (document.querySelector('meta[name="' + name + '"]') || {}).content;
  const tries = [];
  if (meta('horoscope-data')) tries.push(meta('horoscope-data') + '/data/' + date + '.json');
  tries.push(meta('horoscope-api') + '/v1/horoscope?date=' + date);
  for (const url of tries) {
    try {
      const res = await fetch(url);
      if (res.ok) return got(url.includes('/v1/') ? 'api' : 'cdn', (await res.json()).signs || {});
    } catch (e) {}
  }
  return {};
}
