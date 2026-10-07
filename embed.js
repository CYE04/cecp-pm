(function () {
  'use strict';

  const script = document.currentScript;
  const host = document.getElementById('cecp-pm') || document.querySelector('[data-cecp-pm]');
  if (!host || host.dataset.pmMounted) return;
  host.dataset.pmMounted = 'true';

  const baseUrl = host.dataset?.baseUrl || (script?.src ? new URL('./', script.src).href : 'https://cye04.github.io/cecp-pm/');
  host.dataset.baseUrl = baseUrl;

  function detectTheme() {
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

  function applyTheme() {
    host.dataset.theme = detectTheme();
  }
  applyTheme();

  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', applyTheme);
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode'] });
  if (document.body) {
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode'] });
  }

  const cssId = 'cecp-pm-style';
  if (!document.getElementById(cssId)) {
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = new URL('style.css?v=20261007-outline-lines', baseUrl).href;
    document.head.appendChild(link);
  }

  host.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--muted,#888);font-family:system-ui;"><div style="font-size:32px;margin-bottom:12px;">⏳</div><div>正在加载聚会内容…</div></div>';

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL(path, baseUrl).href;
      s.onload = resolve;
      s.onerror = () => reject(new Error('无法加载模块: ' + path));
      document.head.appendChild(s);
    });
  }

  async function mount() {
    try {
      if (!window.PMFeatures) await loadScript('features.js?v=20261004-v6-align');
      if (!window.PMRoster) await loadScript('roster.js?v=20261004-v6-align');
      if (!window.PMSongs) await loadScript('songs.js?v=20261004-v6-align');
      if (!window.PMBible) await loadScript('bible.js?v=20261004-v6-align');
      if (!window.PMEngine) await loadScript('app.js?v=20261007-outline-lines');
      if (!window.PMSongCatalog) {
        try { await loadScript('song-catalog.js'); } catch (_) {}
      }

      await window.PMEngine.render(host, { baseUrl });
    } catch (err) {
      host.innerHTML = `<div style="text-align:center;padding:50px 20px;color:#ef4444;font-family:system-ui;"><div style="font-size:32px;margin-bottom:12px;">❌</div><div>无法加载聚会内容，请刷新重试。</div><div style="font-size:12px;color:var(--muted,#999);margin-top:8px;">${err?.message || '网络连接失败，请检查网络后重试'}</div></div>`;
      console.error('[CECP-PM]', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
