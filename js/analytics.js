// Google Analytics 4. The tag loads after the page has finished loading, so it never
// delays the first paint. Visitors in the EEA, UK and Switzerland (Google decides by IP)
// are counted without cookies until they accept; a small banner asks them, shown to
// visitors whose timezone is in Europe. Everyone else is counted normally.
// window.track(name, params) sends an event (used by app.js and purpose.js).
(function () {
  const ID = 'G-K0XZWJHJ76';
  const EEA = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU',
    'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH'];
  const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag('consent', 'default', { ...denied, region: EEA, wait_for_update: 500 });
  gtag('consent', 'default', { ...denied, analytics_storage: 'granted' });

  let choice = null;
  try { choice = localStorage.getItem('analytics-consent'); } catch (e) {}
  if (choice === 'granted') gtag('consent', 'update', { analytics_storage: 'granted' });

  gtag('js', new Date());
  gtag('config', ID);
  window.track = (name, params) => gtag('event', name, params || {});

  function load() {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
    if (!choice && /^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '')) banner();
  }
  if (document.readyState === 'complete') load(); else addEventListener('load', load);

  function banner() {
    const bar = document.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookies');
    bar.style.cssText = 'position:fixed;z-index:50;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:560px;margin:0 auto;' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:14px 16px;border-radius:20px;background:#111111;color:#F5F3EE;' +
      'font:600 14px/1.4 Outfit,system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35)';
    const text = document.createElement('span');
    text.style.flex = '1 1 240px';
    text.textContent = 'May we use Google Analytics cookies to count visits? No other cookies are used.';
    bar.append(text);
    [['Accept', 'granted'], ['No thanks', 'denied']].forEach(([label, value], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'min-height:40px;padding:0 16px;border-radius:999px;font:800 14px Outfit,system-ui,sans-serif;cursor:pointer;' +
        (i ? 'background:transparent;color:#F5F3EE;border:2px solid #F5F3EE' : 'background:#F5F3EE;color:#111111;border:0');
      b.addEventListener('click', () => {
        try { localStorage.setItem('analytics-consent', value); } catch (e) {}
        gtag('consent', 'update', { analytics_storage: value });
        bar.remove();
      });
      bar.append(b);
    });
    document.body.append(bar);
  }
})();
