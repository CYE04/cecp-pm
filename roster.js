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
  const SOUND_SHEET_URL =
    'https://docs.google.com/spreadsheets/d/1o0FkHnVtvKCZwjIhzPEHSEW-3oZeNsJnh68Qs3GU0TQ/gviz/tq?tqx=out:json&headers=0&sheet=' +
    encodeURIComponent('🎛 调音组安排');
  const OLD_API_ID = 'AKfycbzGQA4R7AFyCOnWX6E74WpnZkF1z_im2DD3sX_bmTCzhW9FVu_Wl77AmPT6GaWfP2nX';
  const NEW_API_ID = 'AKfycbxJaY7RxxThCIGMeuxnlPW7diAJs0M34b5lK8Qn_CzxbIbCZY3AeuYKJadPF8gsLpvK';
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

  function parseGvizSoundTable(rawText, defaultYear = 2026) {
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
    let curMonth = '';
    let curType = '';

    tableRows.forEach(r => {
      const cells = (r && Array.isArray(r.c) ? r.c : []).map(c => {
        if (!c) return '';
        return text(c.f != null ? c.f : c.v);
      });
      const c0 = cells[0] || '';
      const c1 = cells[1] || '';
      const c2 = cells[2] || '';

      const mFull = c0.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/) || c1.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
      if (mFull) {
        curMonth = `${parseInt(mFull[1], 10)}年${parseInt(mFull[2], 10)}月`;
        curType = '';
      } else {
        const mShort = c1.match(/^(\d{1,2})\s*月\s*主日大堂调音/);
        if (mShort) {
          curMonth = `${defaultYear}年${parseInt(mShort[1], 10)}月`;
          curType = '';
        }
      }

      if (c1.indexOf('主日学') >= 0) {
        curType = '';
      } else if (c1.indexOf('青年团契') >= 0 || c1.indexOf('中午12:00') >= 0) {
        curType = '青年团契';
      } else if (c1 === '主日下午' || c1 === '下午') {
        curType = '主日下午';
      } else if (c1 === '主日晚上' || c1 === '晚上') {
        curType = '主日晚上';
      }

      if (!curMonth || !curType) return;

      let roleText = '';
      let weekOffset = 3;
      if (c2 === '调音' || c2 === 'PPT播放' || c2 === '投影' || c2 === '转播和话筒' || c2 === '转播') {
        roleText = c2;
        weekOffset = 3;
      } else if (c1 === '调音' || c1 === 'PPT播放' || c1 === '投影' || c1 === '转播和话筒' || c1 === '转播') {
        roleText = c1;
        weekOffset = 2;
      }
      if (!roleText) return;

      const roleKey = roleText === '调音' ? 'sound'
        : (roleText === 'PPT播放' || roleText === '投影') ? 'ppt'
        : 'broadcast';

      for (let w = 0; w < 5; w++) {
        const val = text(cells[weekOffset + w]);
        if (!val || val === '—' || val === '-' || val === roleText) continue;
        const k = `${curMonth}|${weeks[w]}|${curType}`;
        if (!map[k]) map[k] = {};
        map[k][roleKey] = val;
      }
    });

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(SOUND_SHEET_URL + '&_ts=' + Date.now(), {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit'
      });
      if (res.ok) {
        const raw = await res.text();
        if (raw && raw.indexOf('"status":"ok"') >= 0) {
          const soundMap = parseGvizSoundTable(raw, key.year);
          const entry = soundMap[`${targetMonth}|${key.week}|主日下午`];
          matched.sound = (entry && entry.sound) ? entry.sound : '';
          matched.ppt = (entry && entry.ppt) ? entry.ppt : '';
          matched.broadcast = (entry && entry.broadcast) ? entry.broadcast : '';
        }
      }
    } catch (_) {
      // Ignore fallback error and keep payload values
    } finally {
      clearTimeout(timer);
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
    const normalizedApi = String(api || '').replace(OLD_API_ID, NEW_API_ID);
    const url = new URL(normalizedApi);
    if (url.protocol !== 'https:') throw new Error('服事安排链接无效');
    url.searchParams.set('action', 'all');
    url.searchParams.set('_ts', String(Date.now()));
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
