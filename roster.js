(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PMRoster = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const weeks = ['第一周', '第二周', '第三周', '第四周', '第五周'];
  const roles = [
    ['leader', '主领'], ['worship', '敬拜带领'], ['prayerLeader', '祷告会带领'],
    ['praisePrayer', '颂赞祷告'], ['memorialPrayer', '记念祷告'],
    ['piano', '司琴'], ['drums', '鼓'], ['guitar', '吉他'], ['bass', '贝斯'],
    ['reading', '读经'], ['note', '证道']
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
      duties: roles.map(([key, label]) => ({ key, label, value: text(matches[0][key]) }))
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
      return select(await response.json(), date);
    } finally {
      clearTimeout(timer);
    }
  }

  return { dateKey, select, load };
});
