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
  const SHEET_ID = '1o0FkHnVtvKCZwjIhzPEHSEW-3oZeNsJnh68Qs3GU0TQ';
  const MAIN_SHEET_URL =
    'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' +
    encodeURIComponent('服事安排');
  const SOUND_SHEET_URL =
    'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' +
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

  function parseCsvRows(raw) {
    const rows = [];
    if (!raw || raw.trim().startsWith('<')) return rows;
    let curRow = [];
    let curCell = '';
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inQuotes) {
        if (ch === '"') {
          if (raw[i + 1] === '"') {
            curCell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          curCell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        curRow.push(text(curCell));
        curCell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && raw[i + 1] === '\n') i++;
        curRow.push(text(curCell));
        rows.push(curRow);
        curRow = [];
        curCell = '';
      } else {
        curCell += ch;
      }
    }
    if (curCell.length > 0 || curRow.length > 0) {
      curRow.push(text(curCell));
      rows.push(curRow);
    }
    return rows;
  }

  function extractCellRows(rawText) {
    if (!rawText) return [];
    if (rawText.indexOf('"status":"ok"') >= 0 && rawText.indexOf('{') >= 0) {
      try {
        const json = JSON.parse(rawText.slice(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1));
        const tRows = json?.table?.rows || [];
        return tRows.map(r => (r && Array.isArray(r.c) ? r.c : []).map(c => c ? text(c.f != null ? c.f : c.v) : ''));
      } catch (_) {
        return [];
      }
    }
    return parseCsvRows(rawText);
  }

  function normalizeGvizMonth(raw) {
    const s = text(raw);
    const m = s.match(/(\d{4})\s*[年\/\-]\s*(\d{1,2})/);
    if (m) return `${parseInt(m[1], 10)}年${parseInt(m[2], 10)}月`;
    const md = s.match(/^Date\((\d{4}),\s*(\d{1,2}),/);
    if (md) return `${parseInt(md[1], 10)}年${parseInt(md[2], 10) + 1}月`;
    return '';
  }

  function parseGvizMainSchedule(rawText) {
    const result = [];
    const tableRows = extractCellRows(rawText);
    if (!tableRows.length) return result;
    let blankStreak = 0;
    let hasStarted = false;

    for (let i = 0; i < tableRows.length; i++) {
      const cells = tableRows[i];
      const month = normalizeGvizMonth(cells[0]);
      const week = text(cells[1]);
      const type = text(cells[2]);
      const subtype = text(cells[3]);

      if (!month) {
        if (hasStarted) {
          blankStreak++;
          if (blankStreak >= 5) break;
        }
        continue;
      }
      hasStarted = true;
      blankStreak = 0;
      if (!week || !type) continue;

      let vSound = text(cells[16]);
      let vPpt = text(cells[17]);
      let vBroadcast = text(cells[18]);
      if (vSound === '—' || vSound === '-') vSound = '';
      if (vPpt === '—' || vPpt === '-') vPpt = '';
      if (vBroadcast === '—' || vBroadcast === '-') vBroadcast = '';

      result.push({
        month,
        week,
        type,
        subtype,
        leader: text(cells[4]),
        worship: text(cells[5]),
        prayerLeader: text(cells[6]),
        praisePrayer: text(cells[7]),
        memorialPrayer: text(cells[8]),
        piano: text(cells[9]),
        drums: text(cells[10]),
        guitar: text(cells[11]),
        bass: text(cells[12]),
        reading: text(cells[13]),
        note: text(cells[14]),
        time: text(cells[15]),
        sound: vSound,
        ppt: vPpt,
        broadcast: vBroadcast
      });
    }
    return result;
  }

  function parseGvizSoundTable(rawText, defaultYear = 2026) {
    const map = {};
    const tableRows = extractCellRows(rawText);
    if (!tableRows.length) return map;
    let curMonth = '';
    let bannerMonth = '';
    let curType = '';

    tableRows.forEach(cells => {
      const c0 = text(cells[0]);
      const c1 = text(cells[1]);
      const c2 = text(cells[2]);

      const isBannerRow = (c1 === '聚会时段' || c2 === '服事岗位' || c0.indexOf('📅') >= 0);
      let parsedM = normalizeGvizMonth(c0) || normalizeGvizMonth(c1);
      if (!parsedM) {
        const mShort = c0.match(/(?:^|\D)(\d{1,2})\s*月(?:\s|$|主日)/) || c1.match(/^(\d{1,2})\s*月\s*主日大堂调音/);
        if (mShort) parsedM = `${defaultYear}年${parseInt(mShort[1], 10)}月`;
      }

      if (isBannerRow) {
        if (parsedM) bannerMonth = parsedM;
        curMonth = '';
        curType = '';
        return;
      }

      if (parsedM) {
        curMonth = parsedM;
      } else if (!curMonth && bannerMonth) {
        curMonth = bannerMonth;
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

  async function fetchTextSafe(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      return res.ok ? await res.text() : '';
    } catch (_) {
      return '';
    } finally {
      clearTimeout(timer);
    }
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

  const NOV_2026_SOUND_DEFAULT = {
    '2026年11月|第一周|青年团契': { sound: '胡恩典', ppt: '陈煜恩', broadcast: '' },
    '2026年11月|第二周|青年团契': { sound: '倪翰俊', ppt: '林DANIELE', broadcast: '' },
    '2026年11月|第三周|青年团契': { sound: '陈煜恩', ppt: '戴DANTE', broadcast: '' },
    '2026年11月|第四周|青年团契': { sound: '戴DANTE', ppt: '林DANIELE', broadcast: '' },
    '2026年11月|第五周|青年团契': { sound: '林DANIELE', ppt: '戴DANTE', broadcast: '' },
    '2026年11月|第一周|主日下午': { sound: '陈煜恩', ppt: '倪翰耀', broadcast: '何正' },
    '2026年11月|第二周|主日下午': { sound: '林DANIELE', ppt: '倪翰耀', broadcast: '倪翰俊' },
    '2026年11月|第三周|主日下午': { sound: '倪翰俊', ppt: '叶Romano', broadcast: '吴以勒' },
    '2026年11月|第四周|主日下午': { sound: '林DANIELE', ppt: '杨Samuele', broadcast: '吴以勒' },
    '2026年11月|第五周|主日下午': { sound: '吴以勒', ppt: '陈欣豪', broadcast: '黄振宇' },
    '2026年11月|第一周|主日晚上': { sound: '卓毅豪', ppt: 'Alex', broadcast: '黄振宇' },
    '2026年11月|第二周|主日晚上': { sound: '何正', ppt: '苏Alessio', broadcast: '卓毅豪' },
    '2026年11月|第三周|主日晚上': { sound: '黄振宇', ppt: '毛俊龙', broadcast: '卓毅豪' },
    '2026年11月|第四周|主日晚上': { sound: '黄振宇', ppt: 'Vitto', broadcast: '何正' },
    '2026年11月|第五周|主日晚上': { sound: '何正', ppt: 'Alex', broadcast: '卓毅豪' }
  };

  async function load(api, date) {
    const normalizedApi = String(api || '').replace(OLD_API_ID, NEW_API_ID);
    const url = new URL(normalizedApi);
    if (url.protocol !== 'https:') throw new Error('服事安排链接无效');
    const ts = String(Date.now());

    const [mainRaw, soundRaw] = await Promise.all([
      fetchTextSafe(`${MAIN_SHEET_URL}&_ts=${ts}`, 5000),
      fetchTextSafe(`${SOUND_SHEET_URL}&_ts=${ts}`, 5000)
    ]);

    let rows = parseGvizMainSchedule(mainRaw);
    const soundMap = soundRaw ? parseGvizSoundTable(soundRaw) : {};

    if (!rows.length) {
      url.searchParams.set('action', 'all');
      url.searchParams.set('_ts', ts);
      let apiTxt = await fetchTextSafe(url.href, 8000);
      if (!apiTxt && normalizedApi.indexOf(NEW_API_ID) >= 0) {
        const fallbackUrl = new URL(normalizedApi.replace(NEW_API_ID, OLD_API_ID));
        fallbackUrl.searchParams.set('action', 'all');
        fallbackUrl.searchParams.set('_ts', ts);
        apiTxt = await fetchTextSafe(fallbackUrl.href, 8000);
      }
      if (!apiTxt) throw new Error('服事安排暂时无法读取');
      const parsed = JSON.parse(apiTxt);
      if (!parsed || parsed.ok !== true || !Array.isArray(parsed.data)) {
        throw new Error('服事安排暂时无法读取');
      }
      rows = parsed.data;
    }

    const hasNovInSheet = soundMap && Object.keys(soundMap).some(k => k.indexOf('2026年11月|') === 0);
    rows.forEach(r => {
      const k = `${text(r.month)}|${text(r.week)}|${text(r.type)}`;
      const sm = (soundMap && soundMap[k]) || (!hasNovInSheet ? NOV_2026_SOUND_DEFAULT[k] : null);
      r.sound = text(r.sound) || (sm && sm.sound) || '';
      r.ppt = text(r.ppt) || (sm && sm.ppt) || '';
      r.broadcast = text(r.broadcast) || (sm && sm.broadcast) || '';
    });

    return select({ ok: true, data: rows }, date);
  }

  return { roles, dateKey, select, load, parseGvizSoundTable, parseGvizMainSchedule };
});
