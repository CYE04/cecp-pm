(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PMRoster = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const weeks = ['第一周', '第二周', '第三周', '第四周', '第五周'];
  const roles = [
    ['leader', '主领', 'lead'],
    ['worship', '敬拜带领', 'lead'],
    ['prayerLeader', '祷告会带领', 'lead'],
    ['praisePrayer', '颂赞祷告', 'lead'],
    ['memorialPrayer', '记念祷告', 'lead'],
    ['piano', '司琴', 'worship'],
    ['drums', '鼓', 'worship'],
    ['guitar', '吉他', 'worship'],
    ['bass', '贝斯', 'worship'],
    ['reading', '读经', 'word'],
    ['note', '证道', 'word'],
    ['sound', '调音', 'media'],
    ['ppt', 'PPT播放', 'media'],
    ['broadcast', '转播和话筒', 'media']
  ];
  const SOUND_SHEET_SOURCES = [
    {
      id: '1o0FkHnVtvKCZwjIhzPEHSEW-3oZeNsJnh68Qs3GU0TQ',
      url: 'https://docs.google.com/spreadsheets/d/1o0FkHnVtvKCZwjIhzPEHSEW-3oZeNsJnh68Qs3GU0TQ/gviz/tq?tqx=out:json&headers=0&sheet=' + encodeURIComponent('🎛 调音组安排')
    },
    {
      id: '1gLCINCZq2KD3ijnBuM3G93fHrGtB5CkfdpTc95uMcPs',
      url: 'https://docs.google.com/spreadsheets/d/1gLCINCZq2KD3ijnBuM3G93fHrGtB5CkfdpTc95uMcPs/gviz/tq?tqx=out:json&headers=0&gid=2110695898'
    }
  ];
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

  function dateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const date = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
    // 表中的“第几周”对应当月第几个主日，不匹配其他日期或年份。
    if (date.getUTCDay() !== 0) return null;
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      week: weeks[Math.floor((date.getUTCDate() - 1) / 7)]
    };
  }

  function parseGvizSoundTable(rawText) {
    const map = {};
    if (!rawText) return map;
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start < 0 || end <= start) return map;
    let json;
    try {
      json = JSON.parse(rawText.slice(start, end + 1));
    } catch (_) {
      return map;
    }
    const tableRows = json && json.table && Array.isArray(json.table.rows) ? json.table.rows : [];
    const cellVal = (r, c) => {
      if (!r || !Array.isArray(r.c) || !r.c[c]) return '';
      const cell = r.c[c];
      return text(cell.f != null ? cell.f : (cell.v != null ? cell.v : ''));
    };
    let curMonth = '';
    for (let i = 0; i < tableRows.length; i++) {
      const r = tableRows[i];
      const c1 = cellVal(r, 1);
      const c2 = cellVal(r, 2);
      const monthMatch = c1.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月$/) || c1.match(/^(\d{1,2})\s*月$/);
      if (monthMatch && c2.indexOf('第一周') >= 0) {
        curMonth = monthMatch[2]
          ? `${Number(monthMatch[1])}年${Number(monthMatch[2])}月`
          : `2026年${Number(monthMatch[1])}月`;
        const weekCols = [];
        for (let col = 2; col <= 6; col++) {
          const wName = cellVal(r, col);
          if (/^第[一二三四五]周$/.test(wName)) weekCols.push({ col, week: wName });
        }
        for (let offset = 1; offset <= 5 && (i + offset) < tableRows.length; offset++) {
          const sr = tableRows[i + offset];
          const roleRaw = cellVal(sr, 1).replace(/\s+/g, '');
          let field = '';
          if (roleRaw === '调音') field = 'sound';
          else if (roleRaw.toUpperCase().indexOf('PPT') >= 0 || roleRaw.indexOf('投影') >= 0) field = 'ppt';
          else if (roleRaw.indexOf('转播') >= 0 || roleRaw.indexOf('话筒') >= 0) field = 'broadcast';
          if (!field) continue;
          weekCols.forEach(wc => {
            const val = cellVal(sr, wc.col);
            if (!val || /^[-—–]+$/.test(val)) return;
            const k = `${curMonth}|${wc.week}`;
            if (!map[k]) map[k] = {};
            map[k][field] = val;
          });
        }
      }
    }
    return map;
  }

  async function enrichPayloadWithSound(payload, date) {
    if (!payload || !Array.isArray(payload.data)) return payload;
    const key = dateKey(date);
    if (!key) return payload;
    const targetMonth = `${key.year}年${key.month}月`;
    const matched = payload.data.find(row => {
      if (!row || typeof row !== 'object') return false;
      const m = text(row.month).match(/^(\d{4})年\s*(\d{1,2})月$/);
      return m && +m[1] === key.year && +m[2] === key.month &&
        text(row.week) === key.week && text(row.type) === '主日下午';
    });
    if (!matched) return payload;
    if (text(matched.sound) || text(matched.ppt) || text(matched.broadcast)) return payload;

    for (let i = 0; i < SOUND_SHEET_SOURCES.length; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(SOUND_SHEET_SOURCES[i].url, {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit'
        });
        if (!res.ok) continue;
        const raw = await res.text();
        const soundMap = parseGvizSoundTable(raw);
        const entry = soundMap[`${targetMonth}|${key.week}`];
        if (entry && (entry.sound || entry.ppt || entry.broadcast)) {
          if (entry.sound && !text(matched.sound)) matched.sound = entry.sound;
          if (entry.ppt && !text(matched.ppt)) matched.ppt = entry.ppt;
          if (entry.broadcast && !text(matched.broadcast)) matched.broadcast = entry.broadcast;
          break;
        }
      } catch (_) {
        // Ignore fallback error and try next source
      } finally {
        clearTimeout(timer);
      }
    }
    return payload;
  }

  function select(payload, date) {
    if (!payload || payload.ok !== true || !Array.isArray(payload.data)) {
      throw new Error('服事安排暂时无法读取');
    }
    const key = dateKey(date);
    if (!key) return null;
    const matches = payload.data.filter(row => {
      if (!row || typeof row !== 'object') return false;
      const month = text(row.month).match(/^(\d{4})年\s*(\d{1,2})月$/);
      return month && +month[1] === key.year && +month[2] === key.month &&
        text(row.week) === key.week && text(row.type) === '主日下午';
    });
    if (matches.length > 1) throw new Error('这一天有多份下午服事安排，请同工核对排班表');
    if (!matches.length) return null;
    return {
      label: `${key.year}年${key.month}月 · ${key.week}`,
      duties: roles.map(([key, label, group]) => ({ key, label, group, value: text(matches[0][key]) }))
        .filter(item => item.value && !/^[-—–]+$/.test(item.value))
        .map(item => item.key === 'note'
          ? { ...item, value: item.value.replace(/^证道\s*[:：]\s*/, '') }
          : item)
    };
  }

  async function load(api, date) {
    const url = new URL(api);
    if (url.protocol !== 'https:') throw new Error('服事安排链接无效');
    url.searchParams.set('action', 'all');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url.href, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('服事安排暂时无法读取');
      const payload = await response.json();
      await enrichPayloadWithSound(payload, date);
      return select(payload, date);
    } finally {
      clearTimeout(timer);
    }
  }

  return { roles, dateKey, select, load, parseGvizSoundTable };
});
