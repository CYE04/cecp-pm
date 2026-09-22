(function () {
  'use strict';

  const root = document.getElementById('app');
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  };
  const append = (parent, ...children) => {
    children.filter(Boolean).forEach(child => parent.appendChild(child));
    return parent;
  };
  const safeUrl = value => window.PMFeatures.safeUrl(value);
  const emptyState = message => el('p', 'empty-state', message);
  const link = (label, href) => {
    const a = el('a', 'resource-link', label + ' ↗');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };
  const section = (id, title) => {
    const box = el('section', 'content-section');
    box.id = id;
    box.appendChild(el('h2', '', title));
    return box;
  };

  function render(data) {
    const date = data.date || '';
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
      : date;
    document.title = `${dateLabel}｜主日下午聚会`;
    root.replaceChildren();

    const page = el('main', 'page');
    if (data.preview) page.appendChild(el('p', 'preview-banner', '功能预览 · 此页用于查看功能，不代表本周聚会歌单与回放'));
    const hero = el('header', 'hero');
    append(hero,
      el('p', 'eyebrow', data.venue || '主日相聚'),
      el('h1', '', data.title || '主日下午聚会'),
      el('p', 'hero-date', dateLabel),
      el('p', 'hero-meta', [data.time, data.venue].filter(Boolean).join('　·　'))
    );
    if (data.sermon?.title) hero.appendChild(el('p', 'hero-topic', data.sermon.title));
    page.appendChild(hero);

    if (Array.isArray(data.schedule) && data.schedule.length) {
      const box = section('flow', '聚会流程');
      const list = el('ul', 'schedule');
      data.schedule.forEach(item => {
        const row = el('li', 'schedule-row');
        if (/^[a-z][a-z0-9-]*$/.test(item.section || '')) row.dataset.section = item.section;
        const time = [item.start, item.end].filter(Boolean).join('–');
        const title = el('span', 'schedule-title', item.title || '');
        const jump = /^[a-z][a-z0-9-]*$/.test(item.section || '') ? el('a', 'schedule-jump') : null;
        if (jump) { jump.href = '#' + item.section; jump.appendChild(title); }
        append(row, el('time', 'schedule-time', time), jump || title);
        if (Array.isArray(item.roles) && item.roles.length) {
          const people = el('p', 'schedule-people'); people.dataset.roles = item.roles.join(','); people.hidden = true;
          row.appendChild(people);
        }
        list.appendChild(row);
      });
      box.appendChild(list);
      page.appendChild(box);
      window.PMFeatures.mountSchedule(date, data.schedule, list, data.timeZone || 'Europe/Rome');
    }

    // 正文直接依照同一份 schedule 数组输出，时间表与内容不会出现不同顺序。
    (data.schedule || []).forEach(item => {
      const key = item.section;
      if (!/^[a-z][a-z0-9-]*$/.test(key || '')) return;
      const box = section(key, item.title || '聚会环节');
      box.classList.add('stage-section');
      box.insertBefore(el('p', 'stage-time', [item.start, item.end].filter(Boolean).join('–')), box.querySelector('h2'));
      if (Array.isArray(item.roles) && item.roles.length) {
        const people = el('p', 'stage-people'); people.dataset.roles = item.roles.join(','); people.hidden = true;
        box.appendChild(people);
      }
      if (key === 'prayer' && data.prayerText) box.appendChild(el('p', 'stage-description', data.prayerText));
      if (key === 'worship') {
        const songs = window.PMFeatures.filledSongs(data.songs);
        if (songs.length) {
          const songHost = el('div', 'song-host'); box.appendChild(songHost);
          window.PMSongs.mount(songHost, songs, root.dataset);
        } else {
          box.appendChild(emptyState('本周敬拜诗歌尚未公布，同工正在准备中。'));
        }
      }
      if (key === 'reading') {
        let hasReading = false;
        if (data.reading) {
          // 支持缩写写法：reading: "诗 37" 或 reading: { ref: "林前 3:1-23", note: "..." }
          const raw = data.reading;
          const refStr = typeof raw === 'string' ? raw : raw.ref;
          const reading = (refStr ? window.PMBible.parseRef(refStr) : null) || (typeof raw === 'object' ? raw : null);
          const note = typeof raw === 'object' ? raw.note : undefined;
          if (reading?.reference) {
            hasReading = true;
            const card = el('div', 'reading-card');
            append(card, el('p', 'reading-ref', reading.reference));
            if (note) card.appendChild(el('p', 'muted', note));
            box.appendChild(card);
            window.PMBible.mount(box, reading, root.dataset.bibleApi);
          }
        }
        if (!hasReading) box.appendChild(emptyState('本周读经经文尚未公布，同工正在准备中。'));
        const offeringSongs = window.PMFeatures.filledSongs(data.offeringSongs);
        if (offeringSongs.length) {
          const offeringHost = el('div', 'song-host'); box.appendChild(offeringHost);
          window.PMSongs.mount(offeringHost, offeringSongs, root.dataset);
        } else if (data.offering) {
          box.appendChild(el('p', 'stage-description', data.offering));
        } else {
          box.appendChild(emptyState('本周献诗尚未公布，同工正在准备中。'));
        }
      }
      if (key === 'sermon') {
        const raw = data.sermon || {};
        // 支持 ref 缩写：sermon: { ref: "gldqs 3 1 23", title: "...", ... }
        const parsed = raw.ref ? window.PMBible.parseRef(raw.ref) : null;
        const sermon = parsed ? { ...parsed, ...raw, reference: raw.reference || parsed.reference } : { ...raw };
        sermon.outline = Array.isArray(sermon.outline) ? sermon.outline.filter(point => String(point || '').trim()) : [];
        const hasSermon = sermon.title || sermon.speaker || sermon.reference || sermon.outline.length;
        if (hasSermon) {
          const card = el('div', 'sermon-card');
          if (sermon.title) card.appendChild(el('h3', '', sermon.title));
          if (sermon.reference) card.appendChild(el('p', 'sermon-ref', sermon.reference));
          const speaker = el('p', 'muted', sermon.speaker ? '讲员 · ' + sermon.speaker : '');
          speaker.hidden = !sermon.speaker;
          if (!sermon.speaker) speaker.dataset.rosterSpeaker = 'true';
          card.appendChild(speaker);
          if (Array.isArray(sermon.outline) && sermon.outline.length) {
            const points = el('ul', 'outline');
            sermon.outline.forEach(point => points.appendChild(el('li', '', point)));
            card.appendChild(points);
          }
          box.appendChild(card);
          window.PMBible.mount(box, sermon, root.dataset.bibleApi);
        } else {
          box.appendChild(emptyState('本周证道信息尚未公布，同工正在准备中。'));
        }
      }
      page.appendChild(box);
    });

    if (root.dataset.api) {
      const box = section('roster', '本周服事安排');
      const body = el('div', 'roster-body');
      body.setAttribute('aria-live', 'polite');
      body.setAttribute('aria-atomic', 'true');
      box.appendChild(body);
      page.appendChild(box);
      loadRoster(body, date);
    }

    {
      const box = section('announcements', '通知');
      const announcements = window.PMFeatures.announcementTexts(data.announcements);
      announcements.forEach(copy => {
        const card = el('div', 'notice');
        card.appendChild(el('p', '', copy));
        box.appendChild(card);
      });
      if (!announcements.length) box.appendChild(emptyState('本周暂无通知。'));
      page.appendChild(box);
    }

    const replay = safeUrl(data.replayUrl);
    const replayBox = section('replay', '直播回放');
    if (replay) {
      const embed = window.PMFeatures.videoEmbed(replay);
      if (embed) {
        const frame = el('iframe', 'replay-frame'); frame.src = embed; frame.title = '直播回放'; frame.loading = 'lazy'; frame.allowFullscreen = true;
        frame.allow = 'encrypted-media; picture-in-picture; fullscreen'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
        replayBox.appendChild(frame);
      } else if (/\.(mp4|webm)(?:\?|$)/i.test(replay)) {
        const video = el('video', 'replay-frame'); video.controls = true; video.preload = 'none'; video.src = replay;
        video.setAttribute('aria-label', '直播回放'); replayBox.appendChild(video);
      }
      replayBox.appendChild(link('打开回放', replay));
    } else {
      replayBox.appendChild(el('p', 'replay-empty', '本周暂无直播回放。'));
    }
    page.appendChild(replayBox);

    if (data.invitation) {
      const box = section('invitation', '一同相聚');
      box.appendChild(el('p', 'invitation', data.invitation)); page.appendChild(box);
    }

    append(page, el('footer', 'footer', [data.venue, '主日下午聚会'].filter(Boolean).join(' · ')));
    root.appendChild(page);
  }

  async function loadRoster(body, date) {
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(el('p', 'roster-status', '正在读取本周服事安排…'));
    try {
      const roster = await window.PMRoster.load(root.dataset.api, date);
      body.replaceChildren();
      if (!roster || !roster.duties.length) {
        body.appendChild(el('p', 'roster-status', '这一天的下午服事安排尚未公布。'));
        return;
      }
      body.appendChild(el('p', 'roster-caption', roster.label + ' · 主日下午'));
      const list = el('dl', 'roster-grid');
      roster.duties.forEach(duty => {
        append(list, append(el('div', 'roster-duty'),
          el('dt', '', duty.label), el('dd', '', duty.value)));
      });
      body.appendChild(list);
      const duties = Object.fromEntries(roster.duties.map(duty => [duty.key, duty]));
      root.querySelectorAll('[data-roles]').forEach(slot => {
        slot.textContent = slot.dataset.roles.split(',').map(key => duties[key] ? duties[key].label + ' · ' + duties[key].value : '').filter(Boolean).join('　／　');
        slot.hidden = !slot.textContent;
      });
      if (duties.note?.value) root.querySelectorAll('[data-roster-speaker]').forEach(slot => {
        slot.textContent = '证道安排 · ' + duties.note.value; slot.hidden = false;
      });
    } catch (_) {
      const retry = el('button', 'roster-retry', '重新加载');
      retry.type = 'button';
      retry.addEventListener('click', () => loadRoster(body, date));
      body.replaceChildren(el('p', 'roster-status', '暂时无法读取服事安排，请稍后重试。'), retry);
    } finally {
      body.setAttribute('aria-busy', 'false');
    }
  }

  async function loadJson(path) {
    return window.PMFeatures.json(path);
  }

  async function start() {
    try {
      let date = new URLSearchParams(location.search).get('date');
      if (!date) date = location.protocol === 'file:' ? window.PMWeeklyData?.latest?.date : (await loadJson('./weekly/latest.json')).date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('日期格式不正确，请使用例如 2026-09-20 的日期');
      const data = location.protocol === 'file:'
        ? (window.PMPreviewData || window.PMWeeklyData?.weeks?.[date])
        : await loadJson(root.dataset.content || './weekly/' + date + '.json');
      if (!data) throw new Error('找不到这一周的聚会内容');
      if (data.date !== date) throw new Error('内容日期与文件名不一致');
      render(data);
    } catch (error) {
      const message = '聚会内容暂时无法打开，请检查日期或稍后重试。';
      const box = el('div', 'error', message);
      box.appendChild(window.PMFeatures.button('重新加载', start));
      root.replaceChildren(box);
    }
  }

  start();
})();
