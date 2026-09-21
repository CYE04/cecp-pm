(function () {
  'use strict';
  const { el, safeUrl, json, retry } = window.PMFeatures;
  let enginePromise;
  let lyricsDialog;
  let lyricsObserver;
  const titleKey = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/祢/g, '你').replace(/[\s，,。.!！?？:：、（）()“”"'‘’·－—-]/g, '');
  function matchCatalog(title, catalog = window.PMSongCatalog || []) {
    const key = titleKey(title);
    if (!key || !Array.isArray(catalog)) return '';
    const matches = catalog.filter(song => titleKey(song.title) === key && /^[a-zA-Z0-9_-]+$/.test(song.id || ''));
    return matches.length === 1 ? matches[0].id : '';
  }
  function songLookup(entry, catalog = window.PMSongCatalog || []) {
    if (typeof entry === 'string') return { id: entry, source: 'direct' };
    if (entry?.id) return { id: entry.id, source: 'direct' };
    if (!entry?.title || entry.sections) return { id: '', source: '' };
    const matched = matchCatalog(entry.title, catalog);
    if (matched) return { id: matched, source: 'catalog' };
    // 允许直接把歌曲文件名填在 title 中，无需更新下午网站的曲库目录。
    if (/^[a-zA-Z0-9_-]+$/.test(entry.title)) return { id: entry.title, source: 'title-id' };
    return { id: '', source: '' };
  }
  function hasLyrics(lines) {
    return Array.from(lines || []).some(line => String(line.textContent || '').trim());
  }
  function loadEngine(url) {
    if (window.YouthEngine?.renderSongObjects) return Promise.resolve();
    if (!enginePromise) {
      enginePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => { script.remove(); reject(new Error('歌谱工具加载超时')); }, 15000);
        script.src = url;
        script.onload = () => {
          clearTimeout(timer);
          window.YouthEngine?.renderSongObjects ? resolve() : reject(new Error('歌谱工具暂不可用'));
        };
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('歌谱工具暂不可用')); };
        document.head.appendChild(script);
      }).catch(error => { enginePromise = null; throw error; });
    }
    return enginePromise;
  }

  function normalizeSong(song, mediaBase) {
    const result = { ...song };
    const labels = { 'pre-chorus':'预副歌', chorus:'副歌', verse:'主歌', bridge:'桥段', intro:'前奏', outro:'尾奏', interlude:'间奏' };
    function translate(value) {
      if (typeof value === 'string') return value.replace(/\b(pre-chorus|chorus|verse|bridge|intro|outro|interlude)\b/gi, word => labels[word.toLowerCase()]);
      if (Array.isArray(value)) return value.map(translate);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translate(item)]));
      return value;
    }
    if (result.sections) result.sections = translate(result.sections);
    ['mp3', 'cover', 'lrc', 'youtube', 'scoreImg'].forEach(key => {
      result[key] = safeUrl(result[key], mediaBase);
    });
    return result;
  }

  function plainSong(song) {
    const card = el('article', 'plain-song');
    const title = song.title || '诗歌';
    const heading = el('div', 'plain-song-heading');
    heading.appendChild(el('h3', '', title));
    card.appendChild(heading);
    const audioUrl = safeUrl(song.mp3);
    const scoreUrl = safeUrl(song.scoreImg);
    const url = safeUrl(song.url || song.youtube);
    if (!song.lyrics && !audioUrl && !scoreUrl && !url) {
      const status = el('span', 'song-copy-status');
      status.setAttribute('role', 'status');
      const copy = window.PMFeatures.button('复制歌名', async () => {
        try {
          await window.PMFeatures.copyText(title);
          status.textContent = '已复制歌名';
        } catch (_) { status.textContent = '无法自动复制，请手动选择歌名'; }
      });
      copy.classList.add('song-copy-button');
      heading.appendChild(copy);
      heading.appendChild(status);
    }
    if (song.lyrics) card.appendChild(el('p', 'song-lyrics', song.lyrics));
    if (audioUrl) {
      const audio = el('audio'); audio.controls = true; audio.preload = 'none'; audio.src = audioUrl;
      audio.setAttribute('aria-label', title + '音频'); card.appendChild(audio);
    }
    if (scoreUrl) {
      const a = el('a'); a.href = scoreUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const image = el('img', 'plain-score'); image.src = scoreUrl; image.alt = title + '歌谱，点击查看原图'; image.loading = 'lazy';
      a.appendChild(image); card.appendChild(a);
    }
    if (url) {
      const a = el('a', 'resource-link', '查看诗歌资料 ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; card.appendChild(a);
    }
    return card;
  }

  function ensureLyricsDialog() {
    if (lyricsDialog) return lyricsDialog;
    lyricsDialog = el('dialog', 'pm-lyrics-dialog');
    const frame = el('div', 'pm-lyrics-dialog-frame');
    const header = el('header', 'pm-lyrics-dialog-header');
    const title = el('h2', 'pm-lyrics-dialog-title', '完整歌词');
    const close = window.PMFeatures.button('关闭', () => lyricsDialog.close());
    close.classList.add('pm-lyrics-dialog-close');
    header.append(title, close);
    const lines = el('div', 'pm-lyrics-dialog-lines');
    lines.tabIndex = -1;
    frame.append(header, lines);
    lyricsDialog.appendChild(frame);
    lyricsDialog.addEventListener('click', event => { if (event.target === lyricsDialog) lyricsDialog.close(); });
    lyricsDialog.addEventListener('close', () => {
      lyricsObserver?.disconnect();
      lyricsObserver = null;
    });
    document.body.appendChild(lyricsDialog);
    return lyricsDialog;
  }

  function openLyricsReader(player) {
    const source = player?.querySelector('.ym-pl-lrc-inner');
    const sourceLines = source?.querySelectorAll('.ym-pl-lrc-line');
    if (!hasLyrics(sourceLines)) return;
    const dialog = ensureLyricsDialog();
    const title = dialog.querySelector('.pm-lyrics-dialog-title');
    const target = dialog.querySelector('.pm-lyrics-dialog-lines');
    title.textContent = player.querySelector('.ym-pl-title')?.textContent || '完整歌词';
    let activeIndex = -1;
    const sync = rebuild => {
      const lines = Array.from(source.querySelectorAll('.ym-pl-lrc-line'));
      if (rebuild || target.children.length !== lines.length) {
        target.replaceChildren(...lines.map((line, index) => {
          const copy = el('p', 'pm-lyrics-dialog-line', line.textContent);
          copy.dataset.index = index;
          return copy;
        }));
      }
      const next = lines.findIndex(line => line.classList.contains('active'));
      Array.from(target.children).forEach((line, index) => line.classList.toggle('active', index === next));
      if (next >= 0 && next !== activeIndex) {
        activeIndex = next;
        target.children[next]?.scrollIntoView({ block:'center', behavior:'smooth' });
      }
    };
    lyricsObserver?.disconnect();
    sync(true);
    lyricsObserver = new MutationObserver(records => sync(records.some(record => record.type === 'childList')));
    lyricsObserver.observe(source, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.pm-lyrics-dialog-close')?.focus();
  }

  function enhancePlayer(scoreHost) {
    scoreHost.querySelectorAll('.ym-pl').forEach(player => {
      if (player.dataset.pmEnhanced) return;
      player.dataset.pmEnhanced = 'true';
      player.classList.add('pm-compact-player');
      const lyrics = player.querySelector('.ym-pl-lrc-panel');
      if (!lyrics) return;
      const actions = player.closest('.ym-song-panel')?.querySelector('.pm-song-actions');
      const activate = () => {
        const available = hasLyrics(lyrics.querySelectorAll('.ym-pl-lrc-line'));
        let openButton = actions?.querySelector('.pm-lyrics-button');
        if (available && actions && !openButton) {
          openButton = window.PMFeatures.button('查看歌词', () => openLyricsReader(player));
          openButton.classList.add('sw-tog', 'pm-lyrics-button');
          openButton.setAttribute('aria-label', '打开完整歌词');
          const transpose = actions.querySelector('.pm-transpose-button');
          transpose ? transpose.after(openButton) : actions.prepend(openButton);
        } else if (!available) {
          openButton?.remove();
        }
      };
      activate();
      new MutationObserver(activate).observe(lyrics, { childList:true, subtree:true });
    });
  }

  async function mount(container, entries, config) {
    container.replaceChildren(el('p', 'muted', '正在加载本周诗歌…'));
    const mediaBase = config.mediaBase || 'https://cecp.it/';
    const results = await Promise.allSettled(entries.map(async entry => {
      const { id, source } = songLookup(entry);
      if (id) {
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('诗歌编号不正确');
        try {
          const localSong = location.protocol === 'file:' ? window.PMPreviewSongs?.[id] : null;
          const data = localSong || await json(new URL('songs/' + id + '.json', config.songBase).href);
          const extra = typeof entry === 'object' ? { ...entry } : {};
          if (source === 'title-id') delete extra.title;
          return normalizeSong({ ...data, ...extra }, mediaBase);
        } catch (error) {
          if (source !== 'direct') return normalizeSong(entry, mediaBase);
          throw error;
        }
      }
      return normalizeSong(entry, mediaBase);
    }));
    container.replaceChildren();
    const songs = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const scores = songs.filter(song => Array.isArray(song.sections) && song.sections.length);
    if (scores.length) {
      const scoreHost = el('div', 'shared-songs');
      container.appendChild(scoreHost);
      const renderScores = async () => {
        scoreHost.replaceChildren(el('p', 'muted', '正在准备歌谱…'));
        try {
          const engineUrl = location.protocol === 'file:' && config.songEngineLocal
            ? config.songEngineLocal
            : config.songEngine;
          await loadEngine(engineUrl);
          scoreHost.replaceChildren(window.YouthEngine.renderSongObjects(scores));
          // 下午页只保留移调与视频入口；歌曲名称已在上方标签显示，不再重复一整块资料。
          scoreHost.querySelectorAll('.sw-wrap').forEach(wrap => {
            const header = wrap.querySelector('.sw-hd');
            const transpose = header?.querySelector('.sw-tog');
            const toolsRow = wrap.querySelector('.sw-tools-row');
            if (header && transpose && toolsRow) {
              const ytBtn = toolsRow.querySelector('.yt-btn');
              const actions = el('div', 'pm-song-actions');
              transpose.classList.add('pm-transpose-button');
              const transposeArrow = transpose.querySelector('svg');
              if (transposeArrow) transpose.appendChild(transposeArrow);
              transpose.before(actions);
              actions.appendChild(transpose);
              if (ytBtn && ytBtn.getAttribute('href') !== '#') {
                ytBtn.classList.add('pm-video-button');
                ytBtn.setAttribute('aria-label', '观看诗歌视频');
                ytBtn.title = '观看诗歌视频';
                ytBtn.target = '_blank';
                ytBtn.rel = 'noopener noreferrer';
                const label = document.createElement('span');
                label.textContent = '观看视频';
                ytBtn.appendChild(label);
                actions.appendChild(ytBtn);
              } else if (ytBtn) {
                ytBtn.remove();
              }
              Array.from(header.children).forEach(child => {
                if (child !== actions) child.remove();
              });
            }
            wrap.querySelectorAll('.sw-tools').forEach(t => t.remove());
          });
          enhancePlayer(scoreHost);
          scoreHost.querySelectorAll('audio').forEach(audio => { audio.preload = 'none'; });
          // 和弦仍保留标准音名，性质说明只显示中文。
          document.querySelectorAll('chord-explorer').forEach(explorer => {
            if (explorer.dataset.pmLocalized) return;
            explorer.dataset.pmLocalized = 'true';
            explorer.addEventListener('chord-open', () => {
              const quality = explorer.shadowRoot?.querySelector('.qual');
              if (quality) quality.textContent = quality.textContent.split(' · ')[0];
            });
          });
        } catch (_) { retry(scoreHost, '歌谱暂时无法打开。', renderScores); }
      };
      await renderScores();
    }
    songs.filter(song => !Array.isArray(song.sections) || !song.sections.length).forEach(song => container.appendChild(plainSong(song)));
    if (results.some(result => result.status === 'rejected')) {
      const failed = el('div', 'song-error');
      retry(failed, '部分诗歌暂时无法读取，已加载的诗歌仍可使用。', () => mount(container, entries, config));
      container.appendChild(failed);
    }
    // 切换歌曲或播放另一段音频时，停止之前的音频。
    if (!container.dataset.audioBound) {
      container.dataset.audioBound = 'true';
      container.addEventListener('play', event => {
        if (event.target.tagName === 'AUDIO') container.querySelectorAll('audio').forEach(audio => { if (audio !== event.target) audio.pause(); });
      }, true);
      container.addEventListener('click', event => {
        if (event.target.closest('.ym-song-tab')) container.querySelectorAll('audio').forEach(audio => audio.pause());
      });
    }
  }
  window.PMSongs = { mount, matchCatalog, songLookup, hasLyrics, enhancePlayer, openLyricsReader };
})();
