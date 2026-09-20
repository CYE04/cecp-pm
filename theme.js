(function () {
  'use strict';
  const html = document.documentElement;
  const params = new URLSearchParams(location.search);
  if (params.get('embed') === '1') html.classList.add('pm-embed');

  function applyTheme(value) {
    if (value === 'dark' || value === 'light') html.dataset.resolvedTheme = value;
    else delete html.dataset.resolvedTheme;
  }
  applyTheme(params.get('theme'));

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'cecp-pm-theme') return;
    applyTheme(event.data.theme);
  });

  if (html.classList.contains('pm-embed')) {
    const sendHeight = () => {
      const height = Math.ceil(document.body?.scrollHeight || 0);
      if (height > 0) window.parent.postMessage({ type:'cecp-pm-height', height }, '*');
    };
    window.addEventListener('load', sendHeight);
    document.addEventListener('DOMContentLoaded', () => {
      const content = document.getElementById('app');
      if (content && 'ResizeObserver' in window) new ResizeObserver(sendHeight).observe(content);
      sendHeight();
      // 歌谱图片等动态内容加载完后再上报，避免 iframe 留空白
      [300, 800, 1800, 3500].forEach(ms => setTimeout(sendHeight, ms));
    });
  }
})();
