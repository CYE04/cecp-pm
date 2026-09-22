(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PMFeatures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function button(text, action) {
    const node = el('button', 'control-button', text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  const yesiconPaths = {
    bible: ['M19 2H6a2 2 0 0 0 -2 2v16a2 2 0 0 0 2 2h13a1 1 0 0 0 1 -1V3a1 1 0 0 0 -1 -1M15 12h-3v6h-2v-6H7v-2h3V6h2v4h3z'],
    'book-2': [
      'M19 4v16h-12a3 3 0 0 1 0 -6h12',
      'M7 4h12',
      'M7 4a3 3 0 0 0 -3 3v10'
    ],
    'chevron-down': ['M6 9l6 6l6 -6']
  };
  function yesicon(name, className) {
    const paths = yesiconPaths[name];
    if (!paths) throw new Error('未知图标：' + name);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const filled = name === 'bible';
    svg.setAttribute('fill', filled ? 'currentColor' : 'none');
    svg.setAttribute('stroke', filled ? 'none' : 'currentColor');
    if (!filled) {
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
    }
    svg.setAttribute('aria-hidden', 'true');
    svg.dataset.icon = filled ? 'mdi:bible' : 'tabler:' + name;
    if (className) svg.setAttribute('class', className);
    paths.forEach(value => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', value);
      svg.appendChild(path);
    });
    return svg;
  }
  async function copyText(value, clipboard = globalThis.navigator?.clipboard, doc = globalThis.document) {
    if (clipboard?.writeText) {
      try { await clipboard.writeText(value); return; } catch (_) { /* 改用页面内复制 */ }
    }
    if (!doc?.body || typeof doc.execCommand !== 'function') throw new Error('复制不可用');
    const field = doc.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    doc.body.appendChild(field);
    try {
      field.select();
      field.setSelectionRange?.(0, value.length);
      if (!doc.execCommand('copy')) throw new Error('复制不可用');
    } finally { field.remove(); }
  }
  function safeUrl(value, base) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, base || location.href);
      if (url.protocol === 'file:' && typeof location !== 'undefined' && location.protocol === 'file:' && value.startsWith('./')) {
        return url.pathname.startsWith(new URL('.', location.href).pathname) ? url.href : '';
      }
      return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) ? url.href : '';
    } catch (_) { return ''; }
  }
  async function json(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('内容暂时无法读取');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function retry(container, message, action) {
    container.replaceChildren(el('p', 'muted', message), button('重新加载', action));
  }
  function filledSongs(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(item => {
      if (typeof item === 'string') return !!item.trim();
      if (!item || typeof item !== 'object') return false;
      if (Array.isArray(item.sections) && item.sections.length) return true;
      return ['id', 'title', 'lyrics', 'mp3', 'scoreImg', 'url', 'youtube']
        .some(key => typeof item[key] === 'string' && item[key].trim());
    });
  }
  function announcementTexts(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(item.detail || item.title || '').trim();
    }).filter(Boolean);
  }
  function videoEmbed(value) {
    const safe = safeUrl(value, 'https://cecp.it');
    if (!safe) return '';
    const url = new URL(safe);
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? 'https://www.youtube-nocookie.com/embed/' + id : '';
  }
  function activeSchedule(date, schedule, now = new Date(), zone = 'Europe/Rome') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` !== date) return -1;
    const minutes = +parts.hour * 60 + +parts.minute;
    const toMinutes = value => /^\d{2}:\d{2}$/.test(value || '') ? +value.slice(0, 2) * 60 + +value.slice(3) : NaN;
    return schedule.findIndex((item, i) => {
      const start = toMinutes(item.start);
      const end = toMinutes(item.end || schedule[i + 1]?.start);
      return minutes >= start && minutes < end;
    });
  }
  function mountSchedule(date, schedule, list, zone) {
    function update() {
      const active = activeSchedule(date, schedule, new Date(), zone);
      Array.from(list.children).forEach((row, index) => {
        row.classList.toggle('is-current', index === active);
        row.querySelector('.live-label')?.remove();
        if (index === active) {
          row.setAttribute('aria-current', 'step');
          row.appendChild(el('span', 'live-label', '正在进行'));
        } else row.removeAttribute('aria-current');
      });
    }
    update();
    const interval = setInterval(update, 30000);
    window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
  }
  return { el, button, yesicon, copyText, safeUrl, json, retry, filledSongs, announcementTexts, videoEmbed, activeSchedule, mountSchedule };
});
