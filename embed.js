(function () {
  'use strict';
  const script = document.currentScript;
  const host = document.getElementById('cecp-pm');
  if (!script?.src || !host || host.dataset.pmMounted) return;
  host.dataset.pmMounted = 'true';

  function haloTheme() {
    for (let node = host; node; node = node.parentElement) {
      const value = node.dataset?.resolvedTheme || node.dataset?.theme || node.dataset?.colorMode;
      if (value === 'dark' || value === 'light') return value;
      if (node.classList?.contains('dark')) return 'dark';
      if (node.classList?.contains('light')) return 'light';
    }
    for (let node = host; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor.match(/^rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:[, /]+([\d.]+))?\)/);
      if (!color || (color[4] != null && Number(color[4]) < .95)) continue;
      const brightness = .2126 * Number(color[1]) + .7152 * Number(color[2]) + .0722 * Number(color[3]);
      return brightness < 140 ? 'dark' : 'light';
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  const url = new URL('./', script.src);
  url.searchParams.set('embed', '1');
  const date = host.dataset.date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) url.searchParams.set('date', date);
  url.searchParams.set('theme', haloTheme());
  const iframe = document.createElement('iframe');
  iframe.title = '主日下午聚会程序';
  iframe.src = url.href;
  iframe.loading = 'lazy';
  iframe.allow = 'clipboard-write';
  iframe.style.cssText = 'display:block;width:100%;height:1100px;border:0;background:transparent';
  host.replaceChildren(iframe);

  const syncTheme = () => iframe.contentWindow?.postMessage({ type:'cecp-pm-theme', theme:haloTheme() }, url.origin);
  const syncViewport = () => {
    const rect = iframe.getBoundingClientRect();
    const visual = window.visualViewport;
    const viewportTop = visual?.offsetTop || 0;
    const viewportBottom = viewportTop + (visual?.height || window.innerHeight);
    const visibleTop = Math.max(rect.top, viewportTop);
    const visibleBottom = Math.min(rect.bottom, viewportBottom);
    const height = Math.max(0, visibleBottom - visibleTop);
    iframe.contentWindow?.postMessage({
      type:'cecp-pm-viewport',
      top:Math.max(0, visibleTop - rect.top),
      height,
      width:rect.width
    }, url.origin);
  };
  const syncFrame = () => { syncTheme(); syncViewport(); };
  let viewportFrame = 0;
  const scheduleViewport = () => {
    if (viewportFrame) return;
    viewportFrame = requestAnimationFrame(() => { viewportFrame = 0; syncViewport(); });
  };
  iframe.addEventListener('load', syncFrame);
  window.addEventListener('scroll', scheduleViewport, { passive:true });
  window.addEventListener('resize', scheduleViewport, { passive:true });
  window.visualViewport?.addEventListener?.('scroll', scheduleViewport, { passive:true });
  window.visualViewport?.addEventListener?.('resize', scheduleViewport, { passive:true });
  const observer = new MutationObserver(syncTheme);
  for (let node = host; node; node = node.parentElement) {
    observer.observe(node, { attributes:true, attributeFilter:['class','style','data-theme','data-color-mode','data-resolved-theme'] });
  }
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', syncTheme);
  window.addEventListener('message', event => {
    if (event.source !== iframe.contentWindow || event.origin !== url.origin || event.data?.type !== 'cecp-pm-height') return;
    const height = Number(event.data.height);
    if (Number.isFinite(height) && height >= 200 && height <= 20000) {
      iframe.style.height = height + 'px';
      scheduleViewport();
    }
  });
})();
