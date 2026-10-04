(function () {
  'use strict';
  const { el, safeUrl, json, retry } = window.PMFeatures;
  let enginePromise;
  const titleKey = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/祢/g, '你').replace(/[\s，,。.!！?？:：、（）()“”"'‘’·－—-]/g, '');
  function matchCatalog(title, catalog = window.PMSongCatalog || []) {
    const key = titleKey(title);
    if (!key || !Array.isArray(catalog)) return '';
    const matches = catalog.filter(song => titleKey(song.title) === key && /^[a-zA-Z0-9_-]+$/.test(song.id || ''));
    return matches.length === 1 ? matches[0].id : '';
  }
  function songLookup(entry, catalog = window.PMSongCatalog || []) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return { id: '', source: '' };
      if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return { id: trimmed, source: 'direct' };
      const matched = matchCatalog(trimmed, catalog);
      if (matched) return { id: matched, source: 'catalog' };
      return { id: '', source: 'plain-title' };
    }
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
  function centerLyric(container, line, behavior = 'smooth') {
    if (!container || !line || typeof container.scrollTo !== 'function') return;
    const top = Math.max(0, line.offsetTop - (container.clientHeight - line.offsetHeight) / 2);
    container.scrollTo({ top, behavior });
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

  function engineSource(config, pageLocation = location) {
    const localHost = pageLocation.hostname === '127.0.0.1' || pageLocation.hostname === 'localhost';
    return config.songEngineLocal && (pageLocation.protocol === 'file:' || localHost)
      ? config.songEngineLocal
      : config.songEngine;
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

  function plainSong(song, config) {
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
        const copied = await window.PMFeatures.copyOrSelect(title, { title:'复制歌名', anchor:heading, rows:2 });
        status.textContent = copied ? '已复制歌名' : '下方歌名已全选';
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
      const scoreWrap = el('div', 'sw-score plain-score-wrap');
      const scoreTop = el('div', 'sw-score-top');
      scoreTop.appendChild(el('div', 'sw-score-lbl', '简谱原稿'));
      if (song.origKey) {
        scoreTop.appendChild(el('span', 'sw-score-key sw-score-key-badge', '1 = ' + song.origKey));
      }
      const image = el('img', 'plain-score');
      image.src = scoreUrl;
      image.alt = title + '歌谱，点击放大';
      image.loading = 'lazy';
      image.style.cursor = 'zoom-in';
      const openZoom = async () => {
        try {
          if (!window.CecpZoom?.openImage && config) {
            await loadEngine(engineSource(config));
          }
          if (window.CecpZoom?.openImage) {
            window.CecpZoom.openImage([scoreUrl], 0);
            return;
          }
        } catch (_) {}
        window.open(scoreUrl, '_blank', 'noopener,noreferrer');
      };
      image.addEventListener('click', openZoom);
      scoreWrap.append(scoreTop, image);
      card.appendChild(scoreWrap);
    }
    if (url) {
      const a = el('a', 'resource-link', '查看诗歌资料 ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; card.appendChild(a);
    }
    return card;
  }

  function setLyricsPanelState(panel, trigger, open) {
    panel.dataset.open = String(open);
    panel.classList.toggle('is-open', open);
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    trigger.textContent = open ? '收起歌词' : '查看歌词';
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? '收起完整歌词' : '展开完整歌词');
    if (!open) panel._lyricsObserver?.disconnect();
  }

  function ensureLyricsPanel(player, trigger) {
    const songPanel = player.closest('.ym-song-panel');
    let panel = songPanel?.querySelector('.pm-lyrics-inline');
    if (panel) return panel;
    panel = el('section', 'pm-lyrics-inline');
    const frame = el('div', 'pm-lyrics-inline-frame');
    const header = el('header', 'pm-lyrics-inline-header');
    const title = el('h3', 'pm-lyrics-inline-title', '完整歌词');
    const close = window.PMFeatures.button('收起', () => setLyricsPanelState(panel, trigger, false));
    close.classList.add('pm-lyrics-inline-close');
    header.append(title, close);
    const lines = el('div', 'pm-lyrics-inline-lines');
    frame.append(header, lines);
    panel.appendChild(frame);
    setLyricsPanelState(panel, trigger, false);
    const anchor = trigger.closest('.sw-hd') || player;
    anchor.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function openLyricsReader(player, trigger) {
    const source = player?.querySelector('.ym-pl-lrc-inner');
    const sourceLines = source?.querySelectorAll('.ym-pl-lrc-line');
    if (!hasLyrics(sourceLines)) return;
    const panel = ensureLyricsPanel(player, trigger);
    if (panel.dataset.open === 'true') {
      setLyricsPanelState(panel, trigger, false);
      return;
    }
    const title = panel.querySelector('.pm-lyrics-inline-title');
    const target = panel.querySelector('.pm-lyrics-inline-lines');
    title.textContent = player.querySelector('.ym-pl-title')?.textContent || '完整歌词';
    let activeIndex = -1;
    const sync = (rebuild, shouldScroll = true) => {
      const lines = Array.from(source.querySelectorAll('.ym-pl-lrc-line'));
      if (rebuild || target.children.length !== lines.length) {
        target.replaceChildren(...lines.map((line, index) => {
          const copy = el('p', 'pm-lyrics-inline-line', line.textContent);
          copy.dataset.index = index;
          return copy;
        }));
      }
      const next = lines.findIndex(line => line.classList.contains('active'));
      Array.from(target.children).forEach((line, index) => line.classList.toggle('active', index === next));
      if (next >= 0 && next !== activeIndex) {
        activeIndex = next;
        if (shouldScroll) centerLyric(target, target.children[next]);
      }
    };
    sync(true, false);
    panel._lyricsObserver?.disconnect();
    panel._lyricsObserver = new MutationObserver(records => sync(records.some(record => record.type === 'childList')));
    panel._lyricsObserver.observe(source, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    setLyricsPanelState(panel, trigger, true);
    if (activeIndex >= 0) centerLyric(target, target.children[activeIndex], 'auto');
  }

  function enhancePlayer(scoreHost) {
    scoreHost.querySelectorAll('.ym-pl').forEach(player => {
      if (player.dataset.pmEnhanced) return;
      player.dataset.pmEnhanced = 'true';
      player.classList.add('pm-compact-player');
      const controls = player.querySelector('.ym-pl-controls');
      const volume = player.querySelector('.ym-pl-vol-wrap');
      if (controls) {
        const playbackButtons = el('div', 'pm-playback-buttons');
        Array.from(controls.children).forEach(control => playbackButtons.appendChild(control));
        controls.appendChild(playbackButtons);
        if (volume) {
          volume.classList.add('pm-inline-volume');
          controls.appendChild(volume);
        }
      }
      const lyrics = player.querySelector('.ym-pl-lrc-panel');
      if (!lyrics) return;
      const actions = player.closest('.ym-song-panel')?.querySelector('.pm-song-actions');
      const activate = () => {
        const available = hasLyrics(lyrics.querySelectorAll('.ym-pl-lrc-line'));
        let openButton = actions?.querySelector('.pm-lyrics-button');
        if (available && actions && !openButton) {
          openButton = window.PMFeatures.button('查看歌词', () => openLyricsReader(player, openButton));
          openButton.classList.add('sw-tog', 'pm-lyrics-button');
          openButton.setAttribute('aria-expanded', 'false');
          openButton.setAttribute('aria-label', '展开完整歌词');
          const transpose = actions.querySelector('.pm-transpose-button');
          transpose ? transpose.after(openButton) : actions.prepend(openButton);
        } else if (!available) {
          player.closest('.ym-song-panel')?.querySelector('.pm-lyrics-inline')?.remove();
          openButton?.remove();
        }
      };
      activate();
      new MutationObserver(activate).observe(lyrics, { childList:true, subtree:true });
    });
  }

  function enhanceSongCopy(scoreHost) {
    scoreHost.querySelectorAll('.ym-song-tab-copy').forEach(copyIcon => {
      if (copyIcon.dataset.pmCopyEnhanced) return;
      copyIcon.dataset.pmCopyEnhanced = 'true';
      copyIcon.setAttribute('role', 'button');
      copyIcon.setAttribute('tabindex', '0');
      copyIcon.setAttribute('aria-label', '复制歌名');
      const perform = async event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const tab = copyIcon.closest('.ym-song-tab');
        const title = tab?.querySelector('.ym-song-tab-title')?.textContent?.trim();
        if (!title) return;
        const copied = await window.PMFeatures.copyOrSelect(title, {
          title:'复制歌名', anchor:scoreHost.querySelector('.ym-song-tabs'), rows:2
        });
        if (!copied) return;
        const old = copyIcon.innerHTML;
        copyIcon.innerHTML = '&#10003;';
        copyIcon.style.color = '#16a34a';
        setTimeout(() => { copyIcon.innerHTML = old; copyIcon.style.color = ''; }, 1200);
      };
      copyIcon.addEventListener('click', perform, true);
      copyIcon.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') perform(event);
      });
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
          const isLocal = location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost';
          const localSong = isLocal ? window.PMPreviewSongs?.[id] : null;
          const data = localSong || await json(new URL('songs/' + id + '.json', config.songBase).href);
          const extra = typeof entry === 'object' ? { ...entry } : {};
          if (source === 'title-id') delete extra.title;
          return normalizeSong({ ...data, ...extra }, mediaBase);
        } catch (error) {
          if (window.PMPreviewSongs?.[id]) {
            return normalizeSong({ ...window.PMPreviewSongs[id] }, mediaBase);
          }
          if (typeof entry === 'object' && (entry.title || entry.scoreImg || entry.mp3)) {
            return normalizeSong(entry, mediaBase);
          }
          if (source !== 'direct') {
            const normalized = typeof entry === 'string' ? { title: entry } : entry;
            return normalizeSong(normalized, mediaBase);
          }
          const catalogTitle = window.PMSongCatalog?.find?.(s => s.id === id)?.title;
          const fallbackTitle = (typeof entry === 'object' ? entry.title : '') || catalogTitle || id;
          return normalizeSong({ title: fallbackTitle }, mediaBase);
        }
      }
      const normalizedEntry = typeof entry === 'string' ? { title: entry } : entry;
      return normalizeSong(normalizedEntry, mediaBase);
    }));
    container.replaceChildren();
    const songs = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const scores = songs.filter(song => Array.isArray(song.sections) && song.sections.length);
    const hasPlainScores = songs.some(song => (!song.sections || !song.sections.length) && song.scoreImg);
    if (hasPlainScores && !window.CecpZoom?.openImage && config) {
      loadEngine(engineSource(config)).catch(() => {});
    }
    if (scores.length) {
      const scoreHost = el('div', 'shared-songs');
      container.appendChild(scoreHost);
      const renderScores = async () => {
        scoreHost.replaceChildren(el('p', 'muted', '正在准备歌谱…'));
        try {
          const engineUrl = engineSource(config);
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
              transpose.appendChild(window.PMFeatures.yesicon('chevron-down', 'yesicon pm-chevron-icon'));
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
          enhanceSongCopy(scoreHost);
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
    songs.filter(song => !Array.isArray(song.sections) || !song.sections.length).forEach(song => container.appendChild(plainSong(song, config)));
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
  window.PMSongs = { mount, matchCatalog, songLookup, engineSource, hasLyrics, centerLyric, setLyricsPanelState, enhanceSongCopy, enhancePlayer, openLyricsReader };
})();
