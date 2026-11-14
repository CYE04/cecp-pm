(function () {
  'use strict';

  let root = document.getElementById('cecp-pm') || document.getElementById('app');
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

  function scrollToSection(id) {
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    if (document.documentElement.classList.contains('pm-embed')) {
      const targetTop = target.getBoundingClientRect().top;
      window.parent.postMessage({ type: 'cecp-pm-scroll', top: targetTop }, '*');
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (history.pushState) history.pushState(null, '', '#' + id);
  }

  function render(data) {
    const date = data.date || '';
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
      : date;
    if (root?.id === 'app') document.title = `${dateLabel}｜主日下午聚会`;
    root.replaceChildren();

    const page = el('main', 'page');
    if (data.preview) page.appendChild(el('p', 'preview-banner', '功能预览 · 此页用于查看功能，不代表本周聚会歌单与回放'));
    const hero = el('header', 'hero');
    append(hero,
      el('p', 'eyebrow', data.venue || '主日相聚'),
      el('h1', '', data.title || '主日下午聚会'),
      el('p', 'hero-date', dateLabel),
      el('p', 'hero-meta', data.time || '')
    );
    if (data.sermon?.title) hero.appendChild(el('p', 'hero-topic', data.sermon.title));
    page.appendChild(hero);

    if (Array.isArray(data.schedule) && data.schedule.length) {
      const box = section('flow', '聚会流程');
      const list = el('ul', 'schedule');
      list.style.padding = '0';
      list.style.paddingLeft = '0';
      list.style.marginLeft = '0';
      list.style.listStyle = 'none';
      data.schedule.forEach(item => {
        const row = el('li', 'schedule-row');
        if (/^[a-z][a-z0-9-]*$/.test(item.section || '')) row.dataset.section = item.section;
        const time = [item.start, item.end].filter(Boolean).join('–');
        const title = el('span', 'schedule-title', item.title || '');
        const jump = /^[a-z][a-z0-9-]*$/.test(item.section || '') ? el('a', 'schedule-jump') : null;
        if (jump) {
          jump.href = '#' + item.section;
          jump.appendChild(title);
          jump.addEventListener('click', event => {
            event.preventDefault();
            scrollToSection(item.section);
          });
        }
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
        box.appendChild(el('h3', 'stage-subheading', '读经'));
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
        box.appendChild(el('h3', 'stage-subheading stage-subheading-offering', '献诗'));
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
            const outline = el('div', 'outline');
            outline.textContent = sermon.outline.map(point => String(point || '').trim()).filter(Boolean).join('\n');
            card.appendChild(outline);
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
      const announcements = window.PMFeatures.announcementCards(data.announcements);
      announcements.forEach(item => {
        box.appendChild(window.PMFeatures.announcementCard(item));
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

    if (root?.id === 'app') {
      append(page, el('footer', 'footer', [data.venue, '主日下午聚会'].filter(Boolean).join(' · ')));
    }
    root.appendChild(page);

    const initialHash = location.hash.replace(/^#/, '');
    if (initialHash) {
      setTimeout(() => scrollToSection(initialHash), 300);
    }
  }

  const ROSTER_GROUPS = [
    { id: 'lead', title: '领会与祷告', keys: ['leader', 'worship', 'prayerLeader', 'praisePrayer', 'memorialPrayer'] },
    { id: 'worship', title: '敬拜与司琴乐队', keys: ['piano', 'drums', 'guitar', 'bass'] },
    { id: 'word', title: '读经与证道', keys: ['reading', 'note'] },
    { id: 'media', title: '音控 · 投影 · 转播', keys: ['sound', 'ppt', 'broadcast'] }
  ];
  const PERSON_PALETTES = [
    { bg: '#e8f5ee', fg: '#1e6f43', bd: '#bbe3cd', dBg: 'rgba(46, 160, 95, 0.20)', dFg: '#7ee2a8', dBd: 'rgba(84, 198, 132, 0.36)' },
    { bg: '#e8f2fa', fg: '#1c5d99', bd: '#b8d8f2', dBg: 'rgba(56, 139, 219, 0.20)', dFg: '#85c6ff', dBd: 'rgba(96, 170, 240, 0.36)' },
    { bg: '#f3ecfa', fg: '#5e358c', bd: '#d8c2f0', dBg: 'rgba(148, 102, 214, 0.22)', dFg: '#c8a6ff', dBd: 'rgba(172, 130, 235, 0.36)' },
    { bg: '#fdf0ed', fg: '#9a3422', bd: '#f3c6bd', dBg: 'rgba(219, 98, 76, 0.20)', dFg: '#ffaba0', dBd: 'rgba(235, 125, 108, 0.36)' },
    { bg: '#fbf3e4', fg: '#855312', bd: '#edd4a7', dBg: 'rgba(212, 148, 52, 0.20)', dFg: '#f5c97b', dBd: 'rgba(230, 172, 85, 0.36)' },
    { bg: '#e6f5f6', fg: '#19676d', bd: '#b2e0e3', dBg: 'rgba(42, 162, 171, 0.20)', dFg: '#7de2e8', dBd: 'rgba(79, 193, 201, 0.36)' },
    { bg: '#f9edf3', fg: '#8f2d59', bd: '#ecc1d4', dBg: 'rgba(209, 86, 141, 0.20)', dFg: '#f79ec6', dBd: 'rgba(227, 118, 166, 0.36)' },
    { bg: '#eef0fa', fg: '#394393', bd: '#c4caed', dBg: 'rgba(99, 113, 219, 0.20)', dFg: '#a8b3ff', dBd: 'rgba(130, 143, 235, 0.36)' }
  ];
  const PM_HIDDEN_ROLES_KEY = 'cecp_pm_hidden_roles_v1';

  function readHiddenRosterRoles() {
    try {
      const raw = localStorage.getItem(PM_HIDDEN_ROLES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeHiddenRosterRoles(list) {
    try {
      localStorage.setItem(PM_HIDDEN_ROLES_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function personPalette(name) {
    const clean = String(name || '').replace(/\s+/g, '');
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = ((hash << 5) - hash) + clean.charCodeAt(i);
      hash |= 0;
    }
    return PERSON_PALETTES[Math.abs(hash) % PERSON_PALETTES.length];
  }

  function splitDutyTokens(duty) {
    const raw = String(duty.value || '').trim();
    if (!raw) return { prefixChip: '', names: [] };
    if (duty.key === 'reading') {
      const m = raw.match(/^(\S+)\s+(.+)$/);
      if (m) {
        return {
          prefixChip: m[1],
          names: m[2].split(/[\/、,，]+/).map(s => s.trim()).filter(Boolean)
        };
      }
    }
    return {
      prefixChip: '',
      names: raw.split(/[\/、,，]+/).map(s => s.trim()).filter(Boolean)
    };
  }

  function eyeIcon(off) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (off) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.7 10.7 0 0 1 12 5c5 0 9.3 3.1 11 7.5a11.8 11.8 0 0 1-4 5.2M6.6 6.6A11.8 11.8 0 0 0 1 12.5C2.7 16.9 7 20 12 20c1.8 0 3.5-.4 5-1.1');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    } else {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', 'currentColor');
      circle.setAttribute('stroke-width', '1.8');
      svg.append(path, circle);
    }
    return svg;
  }

  let rosterOutsideBound = false;
  function bindRosterOutsideClose() {
    if (rosterOutsideBound || typeof document === 'undefined') return;
    rosterOutsideBound = true;
    document.addEventListener('click', event => {
      document.querySelectorAll('.roster-filter[open]').forEach(details => {
        if (!details.contains(event.target)) details.open = false;
      });
    });
  }

  function renderRosterBoard(body, roster, keepMenuOpen = false) {
    bindRosterOutsideClose();
    body.replaceChildren();
    let activePerson = '';

    const updatePersonHighlight = person => {
      activePerson = activePerson === person ? '' : person;
      body.classList.toggle('has-person-highlight', Boolean(activePerson));
      body.querySelectorAll('.roster-person-badge').forEach(btn => {
        const matched = Boolean(activePerson) && btn.dataset.person === activePerson;
        btn.classList.toggle('is-active', matched);
        btn.setAttribute('aria-pressed', matched ? 'true' : 'false');
      });
      body.querySelectorAll('.roster-duty').forEach(row => {
        const people = (row.dataset.people || '').split('|').filter(Boolean);
        row.classList.toggle('is-highlighted', Boolean(activePerson) && people.includes(activePerson));
      });
    };

    const hiddenKeys = readHiddenRosterRoles();
    const visibleDuties = roster.duties.filter(d => !hiddenKeys.includes(d.key));

    // Top bar
    const topBar = el('div', 'roster-bar');
    const metaWrap = el('div', 'roster-meta');
    append(
      metaWrap,
      el('p', 'roster-caption', roster.label + ' · 主日下午'),
      el('span', 'roster-subhint', '点击姓名可高亮同工全部服事')
    );

    const actionsWrap = el('div', 'roster-actions');
    const filterDetails = el('details', 'roster-filter');
    if (keepMenuOpen) filterDetails.open = true;
    const filterSummary = el('summary', 'roster-filter-btn');
    if (hiddenKeys.length) filterSummary.classList.add('has-hidden');
    append(
      filterSummary,
      eyeIcon(false),
      el('span', '', hiddenKeys.length ? `岗位筛选 (已隐藏 ${hiddenKeys.length})` : '岗位筛选')
    );
    const filterMenu = el('div', 'roster-filter-menu');
    const filterHead = el('div', 'roster-filter-head');
    filterHead.appendChild(el('span', '', '点击切换显示 / 隐藏'));
    const resetBtn = el('button', 'roster-filter-reset', '全部显示');
    resetBtn.type = 'button';
    resetBtn.disabled = !hiddenKeys.length;
    resetBtn.addEventListener('click', () => {
      writeHiddenRosterRoles([]);
      renderRosterBoard(body, roster, true);
    });
    filterHead.appendChild(resetBtn);
    filterMenu.appendChild(filterHead);

    const filterList = el('div', 'roster-filter-list');
    roster.duties.forEach(duty => {
      const hidden = hiddenKeys.includes(duty.key);
      const itemBtn = el('button', 'roster-filter-item' + (hidden ? ' is-hidden' : ''));
      itemBtn.type = 'button';
      const itemLeft = el('span', 'roster-filter-item-left');
      append(itemLeft, eyeIcon(hidden), el('span', '', duty.label));
      const itemState = el('span', 'roster-filter-item-state', hidden ? '已隐藏' : '显示中');
      append(itemBtn, itemLeft, itemState);
      itemBtn.addEventListener('click', () => {
        const next = readHiddenRosterRoles().filter(k => k !== duty.key);
        if (!hidden) next.push(duty.key);
        writeHiddenRosterRoles(next);
        renderRosterBoard(body, roster, true);
      });
      filterList.appendChild(itemBtn);
    });
    filterMenu.appendChild(filterList);
    append(filterDetails, filterSummary, filterMenu);
    actionsWrap.appendChild(filterDetails);
    append(topBar, metaWrap, actionsWrap);
    body.appendChild(topBar);

    // Hidden roles restore bar
    const hiddenDuties = roster.duties.filter(d => hiddenKeys.includes(d.key));
    if (hiddenDuties.length) {
      const hiddenBar = el('div', 'roster-hidden-bar');
      hiddenBar.appendChild(el('span', 'roster-hidden-label', '已隐藏岗位（点击恢复）：'));
      hiddenDuties.forEach(duty => {
        const chip = el('button', 'roster-hidden-chip');
        chip.type = 'button';
        chip.title = `点击重新显示「${duty.label}」`;
        append(chip, eyeIcon(false), el('span', '', duty.label));
        chip.addEventListener('click', () => {
          writeHiddenRosterRoles(readHiddenRosterRoles().filter(k => k !== duty.key));
          renderRosterBoard(body, roster);
        });
        hiddenBar.appendChild(chip);
      });
      const showAll = el('button', 'roster-hidden-reset', '恢复全部');
      showAll.type = 'button';
      showAll.addEventListener('click', () => {
        writeHiddenRosterRoles([]);
        renderRosterBoard(body, roster);
      });
      hiddenBar.appendChild(showAll);
      body.appendChild(hiddenBar);
    }

    if (!visibleDuties.length) {
      body.appendChild(el('p', 'roster-status', '所有岗位均已隐藏，请点击上方按钮恢复显示。'));
      return;
    }

    const board = el('div', 'roster-board');
    const groupedKeys = new Set();

    ROSTER_GROUPS.forEach(group => {
      const groupDuties = visibleDuties.filter(d => d.group === group.id || group.keys.includes(d.key));
      if (!groupDuties.length) return;
      groupDuties.forEach(d => groupedKeys.add(d.key));

      const groupBox = el('div', 'roster-group');
      groupBox.dataset.group = group.id;
      const groupHd = el('div', 'roster-group-hd');
      append(
        groupHd,
        el('span', 'roster-group-title', group.title),
        el('span', 'roster-group-count', `${groupDuties.length} 项`)
      );
      groupBox.appendChild(groupHd);

      const list = el('dl', 'roster-grid');
      groupDuties.forEach(duty => {
        const row = el('div', 'roster-duty');
        row.dataset.roleKey = duty.key;
        const dt = el('dt', '');
        const labelSpan = el('span', 'roster-duty-label', duty.label);
        const hideBtn = el('button', 'roster-duty-hide');
        hideBtn.type = 'button';
        hideBtn.title = `隐藏「${duty.label}」`;
        hideBtn.setAttribute('aria-label', `隐藏${duty.label}`);
        hideBtn.appendChild(eyeIcon(true));
        hideBtn.addEventListener('click', event => {
          event.stopPropagation();
          const next = readHiddenRosterRoles();
          if (!next.includes(duty.key)) next.push(duty.key);
          writeHiddenRosterRoles(next);
          renderRosterBoard(body, roster);
        });
        append(dt, labelSpan, hideBtn);

        const dd = el('dd', '');
        const { prefixChip, names } = splitDutyTokens(duty);
        const normalizedPeople = [];
        if (prefixChip) {
          const refChip = el('span', 'roster-ref-chip');
          append(refChip, window.PMFeatures.yesicon('book-2', 'roster-ref-icon'), el('span', '', prefixChip));
          dd.appendChild(refChip);
        }
        names.forEach(name => {
          const cleanName = name.replace(/\s+/g, '');
          normalizedPeople.push(cleanName);
          const pal = personPalette(cleanName);
          const badge = el('button', 'roster-person-badge', name);
          badge.type = 'button';
          badge.dataset.person = cleanName;
          badge.setAttribute('aria-pressed', 'false');
          badge.style.setProperty('--p-bg', pal.bg);
          badge.style.setProperty('--p-fg', pal.fg);
          badge.style.setProperty('--p-bd', pal.bd);
          badge.style.setProperty('--p-bg-dark', pal.dBg);
          badge.style.setProperty('--p-fg-dark', pal.dFg);
          badge.style.setProperty('--p-bd-dark', pal.dBd);
          badge.addEventListener('click', () => updatePersonHighlight(cleanName));
          dd.appendChild(badge);
        });
        row.dataset.people = normalizedPeople.join('|');
        append(row, dt, dd);
        list.appendChild(row);
      });

      groupBox.appendChild(list);
      board.appendChild(groupBox);
    });

    body.appendChild(board);
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
      renderRosterBoard(body, roster);
      const duties = Object.fromEntries(roster.duties.map(duty => [duty.key, duty]));
      root.querySelectorAll('[data-roles]').forEach(slot => {
        slot.textContent = slot.dataset.roles.split(',').map(key => duties[key] ? duties[key].label + ' · ' + duties[key].value : '').filter(Boolean).join(' / ');
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

  async function start(targetRoot, options = {}) {
    if (targetRoot) root = targetRoot;
    if (!root) root = document.getElementById('cecp-pm') || document.getElementById('app');
    if (!root) return;

    const ds = root.dataset;
    ds.api = (ds.api || options.api || 'https://script.google.com/macros/s/AKfycbxJaY7RxxThCIGMeuxnlPW7diAJs0M34b5lK8Qn_CzxbIbCZY3AeuYKJadPF8gsLpvK/exec')
      .replace('AKfycbzGQA4R7AFyCOnWX6E74WpnZkF1z_im2DD3sX_bmTCzhW9FVu_Wl77AmPT6GaWfP2nX', 'AKfycbxJaY7RxxThCIGMeuxnlPW7diAJs0M34b5lK8Qn_CzxbIbCZY3AeuYKJadPF8gsLpvK');
    ds.songBase = ds.songBase || options.songBase || 'https://cye04.github.io/songs/';
    ds.songEngine = ds.songEngine || options.songEngine || 'https://cye04.github.io/Cecp/youth-engine.js?v=20261004-halo-score2';
    ds.songEngineLocal = ds.songEngineLocal || options.songEngineLocal || '../youth-engine.js?v=20261004-youth-viewer';
    ds.mediaBase = ds.mediaBase || options.mediaBase || 'https://cecp.it/';
    ds.bibleApi = ds.bibleApi || options.bibleApi || 'https://bible.cecp.workers.dev/';

    const baseUrl = options.baseUrl || './';

    try {
      let date = options.date || ds.date || new URLSearchParams(location.search).get('date');
      if (!date) {
        if (location.protocol === 'file:' && window.PMWeeklyData?.latest?.date) {
          date = window.PMWeeklyData.latest.date;
        } else {
          const latestData = await loadJson(new URL('weekly/latest.json', baseUrl).href);
          date = latestData.date;
        }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('日期格式不正确，请使用例如 2026-09-20 的日期');
      let data = null;
      if (location.protocol === 'file:' && (window.PMPreviewData || window.PMWeeklyData?.weeks?.[date])) {
        data = window.PMPreviewData || window.PMWeeklyData.weeks[date];
      } else {
        const weeklyUrl = ds.content ? new URL(ds.content, baseUrl).href : new URL('weekly/' + date + '.json', baseUrl).href;
        data = await loadJson(weeklyUrl);
      }
      if (!data) throw new Error('找不到这一周的聚会内容');
      if (data.date !== date) throw new Error('内容日期与文件名不一致');
      render(data);
    } catch (error) {
      const message = '聚会内容暂时无法打开，请检查日期或稍后重试。';
      const box = el('div', 'error', message);
      box.appendChild(window.PMFeatures.button('重新加载', () => start(root, options)));
      root.replaceChildren(box);
    }
  }

  window.PMEngine = {
    render: (targetRoot, options) => start(targetRoot, options),
    start
  };

  // 独立页面（含 #app）自动启动；嵌入模式由 embed.js 或外部调用 PMEngine.render
  if (document.getElementById('app') && !document.getElementById('cecp-pm')) {
    document.body?.classList.add('pm-standalone');
    start(document.getElementById('app'));
  }
})();
