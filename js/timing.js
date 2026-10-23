// Page timing: how long each step of a visit took, sent once to Google Analytics as the
// event page_timing when the visitor leaves (or hides) the page. All values are in ms
// from the start of the visit unless noted. Add ?timing to the address to also print
// the steps and the slowest files in the browser console.
//
//   dns, connect   looking up and connecting to the site (0 if the connection was reused)
//   ttfb           first byte of the page; html: the whole page arrived
//   fcp, lcp       first paint and largest paint (the moment the line is readable)
//   lines          today's lines shown (signs.js marks it; lines_from: baked, cdn or api)
//   sky            the constellation and planets start drawing (app.js)
//   load           the browser's load event
//   blocked        main thread busy in long tasks (> 50ms), total: taps feel slow then
//   inp            slowest tap or key press until the next frame (Interaction to Next Paint)
//   cls            layout shift x 1000
//   slowest        the slowest file and how long it took
(function () {
  if (!window.PerformanceObserver || !performance.getEntriesByType) return;
  const r = Math.round;
  const v = { lcp: 0, blocked: 0, inp: 0, cls: 0 };
  const watch = (type, fn) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, durationThreshold: 40 }); } catch (e) {}
  };
  watch('largest-contentful-paint', (e) => (v.lcp = e.startTime));
  watch('longtask', (e) => (v.blocked += e.duration));
  watch('event', (e) => { if (e.interactionId) v.inp = Math.max(v.inp, e.duration); });
  watch('layout-shift', (e) => { if (!e.hadRecentInput) v.cls += e.value; });

  function collect() {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const mark = (name) => { const m = performance.getEntriesByName(name).pop(); return m ? r(m.startTime) : undefined; };
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const lines = performance.getEntriesByType('mark').find((m) => m.name.startsWith('lines:'));
    const files = performance.getEntriesByType('resource').filter((e) => e.initiatorType !== 'beacon' && !/googletagmanager|google-analytics|cloudflareinsights|cdn-cgi/.test(e.name));
    const slow = files.reduce((a, b) => (b.duration > (a ? a.duration : -1) ? b : a), null);
    return {
      page: location.pathname,
      dns: r(n.domainLookupEnd - n.domainLookupStart) || 0,
      connect: r(n.connectEnd - n.connectStart) || 0,
      ttfb: r(n.responseStart),
      html: r(n.responseEnd),
      fcp: fcp ? r(fcp.startTime) : undefined,
      lcp: r(v.lcp) || undefined,
      lines: lines ? r(lines.startTime) : undefined,
      lines_from: lines ? lines.name.slice(6) : undefined,
      sky: mark('sky'),
      load: r(n.loadEventStart) || undefined,
      blocked: r(v.blocked),
      inp: r(v.inp),
      cls: r(v.cls * 1000),
      slowest: slow ? slow.name.replace(/^https?:\/\/(www\.)?/, '').split('?')[0].slice(0, 90) : undefined,
      slowest_ms: slow ? r(slow.duration) : undefined,
      network: (navigator.connection && navigator.connection.effectiveType) || undefined,
      // How the page itself came: from the browser's cache, a reused page, or the network.
      nav: n.type === 'back_forward' ? 'back_forward' : n.transferSize === 0 ? 'cache' : 'network'
    };
  }

  if (/[?&]timing\b/.test(location.search)) {
    addEventListener('load', () => setTimeout(() => {
      console.table(collect());
      console.table(performance.getEntriesByType('resource')
        .map((e) => ({ file: e.name.replace(/^https?:\/\//, '').split('?')[0], start: r(e.startTime), ms: r(e.duration), server: r(e.responseStart - e.requestStart), kb: r(e.transferSize / 1024) }))
        .sort((a, b) => b.ms - a.ms));
    }, 3000));
  }

  let sent = false;
  function send() {
    if (sent || !window.track) return;
    sent = true;
    window.track('page_timing', { ...collect(), transport_type: 'beacon' });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); });
  addEventListener('pagehide', send);
})();
