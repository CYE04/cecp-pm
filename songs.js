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
    if (typeof entry === 'string') return { id: entry, source: 'direct' };
    if (entry?.id) return { id: entry.id, source: 'direct' };
    if (!entry?.title || entry.sections) return { id: '', source: '' };
    const matched = matchCatalog(entry.title, catalog);
    if (matched) return { id: matched, source: 'catalog' };
    // 允许直接把歌曲文件名填在 title 中，无需更新下午网站的曲库目录。
    if (/^[a-zA-Z0-9_-]+$/.test(entry.title)) return { id: entry.title, source: 'title-id' };
    return { id: '', source: '' };
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

  async function mount(container, entries, config) {
    container.replaceChildren(el('p', 'muted', '正在加载本周诗歌…'));
    const mediaBase = config.mediaBase || 'https://cecp.it/';
    const results = await Promise.allSettled(entries.map(async entry => {
      const { id, source } = songLookup(entry);
      if (id) {
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('诗歌编号不正确');
        try {
          const data = await json(new URL('songs/' + id + '.json', config.songBase).href);
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
          await loadEngine(config.songEngine);
          scoreHost.replaceChildren(window.YouthEngine.renderSongObjects(scores));
          // 把 YouTube 链接嵌进 .sw-pills（调号/拍子/BPM 同一行），移除其他工具栏
          scoreHost.querySelectorAll('.sw-wrap').forEach(wrap => {
            const pills = wrap.querySelector('.sw-pills');
            const toolsRow = wrap.querySelector('.sw-tools-row');
            if (pills && toolsRow) {
              const ytBtn = toolsRow.querySelector('.yt-btn');
              if (ytBtn && ytBtn.getAttribute('href') !== '#') {
                // 改成小 pill 样式，与调号 pill 一致
                ytBtn.className = 'sw-pill';
                ytBtn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;text-decoration:none;';
                ytBtn.setAttribute('aria-label', '观看诗歌视频');
                ytBtn.title = '观看诗歌视频';
                ytBtn.target = '_blank';
                ytBtn.rel = 'noopener noreferrer';
                // 保留 svg icon，加文字
                const label = document.createElement('span');
                label.textContent = 'YouTube';
                ytBtn.appendChild(label);
                pills.appendChild(ytBtn);
              } else if (ytBtn) {
                ytBtn.remove();
              }
            }
            // 移除工具栏
            wrap.querySelectorAll('.sw-tools').forEach(t => t.remove());
          });
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
  window.PMSongs = { mount, matchCatalog, songLookup };
})();
