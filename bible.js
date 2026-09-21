(function () {
  'use strict';
  const { el, button, json, retry } = window.PMFeatures;
  const names = '创世记 出埃及记 利未记 民数记 申命记 约书亚记 士师记 路得记 撒母耳记上 撒母耳记下 列王纪上 列王纪下 历代志上 历代志下 以斯拉记 尼希米记 以斯帖记 约伯记 诗篇 箴言 传道书 雅歌 以赛亚书 耶利米书 耶利米哀歌 以西结书 但以理书 何西阿书 约珥书 阿摩司书 俄巴底亚书 约拿书 弥迦书 那鸿书 哈巴谷书 西番雅书 哈该书 撒迦利亚书 玛拉基书 马太福音 马可福音 路加福音 约翰福音 使徒行传 罗马书 哥林多前书 哥林多后书 加拉太书 以弗所书 腓立比书 歌罗西书 帖撒罗尼迦前书 帖撒罗尼迦后书 提摩太前书 提摩太后书 提多书 腓利门书 希伯来书 雅各书 彼得前书 彼得后书 约翰一书 约翰二书 约翰三书 犹大书 启示录'.split(' ');
  const chapters = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
  let serial = 0;

  function setDrawerState(details, panel, open, options = {}) {
    const toggle = details.querySelector('.bible-reader-toggle');
    const label = toggle?.querySelector('.bible-reader-label');
    const reduceMotion = options.reduceMotion ?? !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const token = String((Number(details.dataset.drawerToken) || 0) + 1);
    details.dataset.drawerToken = token;
    details.dataset.open = String(open);
    toggle?.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? '收起经文' : '展开经文';

    if (reduceMotion) {
      details.open = open;
      panel.hidden = !open;
      panel.style.height = open ? 'auto' : '0px';
      panel.style.opacity = open ? '1' : '0';
      return;
    }

    const frame = window.requestAnimationFrame || (callback => setTimeout(callback, 0));
    const finish = callback => setTimeout(() => {
      if (details.dataset.drawerToken === token) callback();
    }, 380);
    if (open) {
      details.open = true;
      panel.hidden = false;
      panel.style.height = '0px';
      panel.style.opacity = '0';
      frame(() => frame(() => {
        if (details.dataset.drawerToken !== token) return;
        panel.style.height = panel.scrollHeight + 'px';
        panel.style.opacity = '1';
        finish(() => { panel.style.height = 'auto'; });
      }));
    } else {
      if (!details.open) {
        panel.hidden = true;
        panel.style.height = '0px';
        return;
      }
      panel.hidden = false;
      panel.style.height = panel.scrollHeight + 'px';
      panel.style.opacity = '1';
      void panel.offsetHeight;
      frame(() => {
        if (details.dataset.drawerToken !== token) return;
        panel.style.height = '0px';
        panel.style.opacity = '0';
        finish(() => { details.open = false; panel.hidden = true; });
      });
    }
  }

  function mount(host, passage, endpoint) {
    if (!Number.isInteger(passage.book) || !names[passage.book - 1] || !Number.isInteger(passage.chapter) || passage.chapter < 1 || passage.chapter > chapters[passage.book - 1]) return;
    const id = 'pm-bible-' + ++serial;
    const details = el('details', 'bible-reader');
    const summary = el('summary', 'bible-reader-toggle');
    summary.setAttribute('aria-expanded', 'false');
    const summaryText = el('span', 'bible-reader-copy');
    summaryText.append(el('span', 'bible-reader-label', '展开经文'), el('span', 'bible-reader-reference', passage.reference || `${names[passage.book - 1]} ${passage.chapter} 章`));
    summary.append(el('span', 'bible-reader-icon', '经'), summaryText, el('span', 'bible-reader-arrow', '⌄'));
    details.appendChild(summary);
    const form = el('form', 'bible-form');
    const bookLabel = el('label', '', '经卷');
    const books = el('select'); books.setAttribute('aria-label', '选择经卷');
    names.forEach((name, index) => { const option = el('option', '', name); option.value = index + 1; books.appendChild(option); });
    books.value = passage.book;
    bookLabel.appendChild(books);
    const chapterLabel = el('label', '', '章');
    const chapter = el('input'); chapter.type = 'number'; chapter.min = 1; chapter.max = chapters[passage.book - 1]; chapter.value = passage.chapter; chapter.required = true; chapter.setAttribute('aria-label', '章节');
    chapterLabel.appendChild(chapter);
    const submit = el('button', 'control-button', '查阅'); submit.type = 'submit';
    form.append(bookLabel, chapterLabel, submit);
    const title = el('h3', 'bible-heading');
    const tools = el('div', 'reader-tools');
    const content = el('div', 'bible-verses'); content.setAttribute('aria-live', 'polite');
    const feedback = el('p', 'reader-feedback'); feedback.setAttribute('role', 'status');
    let verses = [], currentBook = passage.book, currentChapter = passage.chapter, request = 0, started = false, fontSize = 19;
    const dialog = el('dialog', 'reader-dialog'); dialog.setAttribute('aria-labelledby', id);
    const dialogTitle = el('h2'); dialogTitle.id = id;
    const dialogContent = el('div', 'bible-verses');
    const close = button('关闭阅读', () => dialog.close());
    const dialogTools = el('div', 'reader-tools');
    dialog.append(dialogTitle, dialogTools, dialogContent);
    document.body.appendChild(dialog);

    function setSize(delta) {
      fontSize = Math.max(16, Math.min(30, fontSize + delta));
      content.style.fontSize = dialogContent.style.fontSize = fontSize + 'px';
    }
    async function copy() {
      try {
        await navigator.clipboard.writeText(title.textContent + '\n' + verses.map(verse => verse.verse + ' ' + verse.text).join('\n'));
        feedback.textContent = '经文已复制';
      } catch (_) { feedback.textContent = '暂时无法复制，请选中经文后复制。'; }
    }
    const copyButton = button('复制经文', copy);
    const fullButton = button('大字阅读', () => {
      dialogTitle.textContent = title.textContent;
      renderVerses(dialogContent);
      dialog.showModal();
    });
    tools.append(button('减小字号', () => setSize(-2)), button('增大字号', () => setSize(2)), copyButton, fullButton);
    dialogTools.append(button('减小字号', () => setSize(-2)), button('增大字号', () => setSize(2)), close);
    function renderVerses(target) {
      target.replaceChildren();
      verses.forEach(verse => {
        const p = el('p', 'bible-verse'); p.append(el('sup', '', verse.verse), document.createTextNode(verse.text)); target.appendChild(p);
      });
    }
    async function load(book, number, range) {
      const token = ++request;
      currentBook = book; currentChapter = number;
      books.value = book; chapter.value = number; chapter.max = chapters[book - 1];
      previous.disabled = number <= 1; next.disabled = number >= chapters[book - 1];
      title.textContent = `${names[book - 1]} ${number} 章${range?.start ? ' ' + range.start + (range.end && range.end !== range.start ? '–' + range.end : '') + ' 节' : ''} · 和合本`;
      verses = []; copyButton.disabled = fullButton.disabled = true; feedback.textContent = '';
      content.replaceChildren(el('p', 'muted', '正在读取经文…'));
      try {
        const url = new URL(endpoint); url.searchParams.set('translations', 'CUNPSS'); url.searchParams.set('book', book); url.searchParams.set('chapter', number);
        if (range?.start) url.searchParams.set('verses', range.start + '-' + (range.end || range.start));
        const data = await json(url.href);
        if (token !== request) return;
        if (!data.ok || !Array.isArray(data.data?.CUNPSS) || !data.data.CUNPSS.length) throw new Error('无经文');
        verses = data.data.CUNPSS;
        renderVerses(content); copyButton.disabled = fullButton.disabled = false;
      } catch (_) {
        if (token === request) retry(content, '经文暂时无法读取，请重试。', () => load(book, number, range));
      }
    }
    const pager = el('div', 'reader-tools');
    const previous = button('上一章', () => load(currentBook, currentChapter - 1));
    const next = button('下一章', () => load(currentBook, currentChapter + 1));
    const original = button('回到本周经文', () => load(passage.book, passage.chapter, passage));
    pager.append(previous, next, original);
    const panel = el('div', 'bible-reader-panel'); panel.hidden = true;
    const panelInner = el('div', 'bible-reader-panel-inner');
    panelInner.append(form, title, tools, feedback, content, pager);
    panel.appendChild(panelInner);
    details.appendChild(panel);
    books.addEventListener('change', () => { chapter.max = chapters[+books.value - 1]; chapter.value = 1; });
    form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) load(+books.value, +chapter.value); });
    summary.addEventListener('click', event => {
      event.preventDefault();
      const open = details.dataset.open !== 'true';
      setDrawerState(details, panel, open);
      if (open && !started) { started = true; load(passage.book, passage.chapter, passage); }
    });
    if ('ResizeObserver' in window) new ResizeObserver(() => {
      if (details.dataset.open === 'true' && panel.style.height && panel.style.height !== 'auto') panel.style.height = panel.scrollHeight + 'px';
    }).observe(panelInner);
    host.appendChild(details);
  }
  // 书卷缩写对照表（index = 书卷号 - 1，值是可接受的缩写数组）
  const aliases = [
    ['创','gen','csj'],                              // 1  创世记
    ['出','exo','ex','caej'],                        // 2  出埃及记
    ['利','lev','lwj'],                              // 3  利未记
    ['民','num','msj'],                              // 4  民数记
    ['申','deut','deu','smj'],                       // 5  申命记
    ['书','josh','jos','ysj'],                       // 6  约书亚记
    ['士','judg','jdg','ssj'],                       // 7  士师记
    ['得','ruth','rut','ldj'],                       // 8  路得记
    ['撒上','1sam','1sa','smejs'],                   // 9  撒母耳记上
    ['撒下','2sam','2sa','smejx'],                   // 10 撒母耳记下
    ['王上','1kgs','1ki','lwjs'],                    // 11 列王纪上
    ['王下','2kgs','2ki','lwjx'],                    // 12 列王纪下
    ['代上','1chr','1ch','ldzs'],                    // 13 历代志上
    ['代下','2chr','2ch','ldzx'],                    // 14 历代志下
    ['拉','ezra','ezr','yslj'],                      // 15 以斯拉记
    ['尼','neh','nxmj'],                             // 16 尼希米记
    ['斯','esth','est','ystj'],                      // 17 以斯帖记
    ['伯','job','ybj'],                              // 18 约伯记
    ['诗','ps','psa','sp'],                          // 19 诗篇
    ['箴','prov','pro','zy'],                        // 20 箴言
    ['传','eccl','ecc','cds'],                       // 21 传道书
    ['歌','song','sng','yg'],                        // 22 雅歌
    ['赛','isa','ysys'],                             // 23 以赛亚书
    ['耶','jer','ylms'],                             // 24 耶利米书
    ['哀','lam','ylmag'],                            // 25 耶利米哀歌
    ['结','ezek','eze','yxjs'],                      // 26 以西结书
    ['但','dan','dyls'],                             // 27 但以理书
    ['何','hos','hxas'],                             // 28 何西阿书
    ['珥','joel','jol','yes'],                       // 29 约珥书
    ['摩','amos','amss'],                            // 30 阿摩司书
    ['俄','obad','oba','ebdys'],                     // 31 俄巴底亚书
    ['拿','jonah','jon','yns'],                      // 32 约拿书
    ['弥','mic','mjs'],                              // 33 弥迦书
    ['鸿','nah','nhs'],                              // 34 那鸿书
    ['哈','hab','hbgs'],                             // 35 哈巴谷书
    ['番','zeph','zep','xfys'],                      // 36 西番雅书
    ['该','hag','hgs'],                              // 37 哈该书
    ['亚','zech','zec','sjlys'],                     // 38 撒迦利亚书
    ['玛','mal','mljs'],                             // 39 玛拉基书
    ['太','matt','mat','mtfy'],                      // 40 马太福音
    ['可','mark','mrk','mkfy'],                      // 41 马可福音
    ['路','luke','luk','ljfy'],                      // 42 路加福音
    ['约','john','jhn','yhfy'],                      // 43 约翰福音
    ['徒','acts','act','stxz'],                      // 44 使徒行传
    ['罗','rom','lms'],                              // 45 罗马书
    ['林前','1cor','1co','gldqs'],                   // 46 哥林多前书
    ['林后','2cor','2co','gldhs'],                   // 47 哥林多后书
    ['加','gal','jlts'],                             // 48 加拉太书
    ['弗','eph','yfss'],                             // 49 以弗所书
    ['腓','phil','php','flbs'],                      // 50 腓立比书
    ['西','col','glxs'],                             // 51 歌罗西书
    ['帖前','1thess','1th','tsqjqs'],                // 52 帖撒罗尼迦前书
    ['帖后','2thess','2th','tsqjhs'],                // 53 帖撒罗尼迦后书
    ['提前','1tim','1ti','tmtqs'],                   // 54 提摩太前书
    ['提后','2tim','2ti','tmths'],                   // 55 提摩太后书
    ['多','titus','tit','tds'],                      // 56 提多书
    ['门','phlm','phm','flms'],                      // 57 腓利门书
    ['来','heb','xbls'],                             // 58 希伯来书
    ['雅','jas','ygs'],                              // 59 雅各书
    ['彼前','1pet','1pe','bdqs'],                    // 60 彼得前书
    ['彼后','2pet','2pe','bdhs'],                    // 61 彼得后书
    ['约一','1jn','1john','yhys'],                   // 62 约翰一书
    ['约二','2jn','2john','yhes'],                   // 63 约翰二书
    ['约三','3jn','3john','yhss'],                   // 64 约翰三书
    ['犹','jude','yds'],                             // 65 犹大书
    ['启','rev','qsl'],                              // 66 启示录
  ];
  // 构建查找表：缩写 + 全名 → 书卷号
  const aliasMap = Object.create(null);
  aliases.forEach((list, i) => list.forEach(a => { aliasMap[a] = i + 1; }));
  // 全名也支持（去掉「记/书/音/传」等后缀的短名也支持）
  names.forEach((name, i) => {
    aliasMap[name] = i + 1;                              // 完整全名，如「哥林多前书」
    const short = name.replace(/[记书音传歌篇言]$/, '');  // 去掉最后一个字的短名，如「哥林多前」
    if (short && short !== name) aliasMap[short] = i + 1;
  });

  // parseRef("诗 37") / parseRef("林前 3:1-23") / parseRef("创 1:1")
  // 返回 { book, chapter, start?, end?, reference } 或 null
  function parseRef(str) {
    if (!str || typeof str !== 'string') return null;
    str = str.trim();
    // 匹配：<书卷> <章> [<起节> [<终节>]]  — 章/节之间用空格或冒号或连字符分隔均可
    const m = str.match(/^(\S+)\s+(\d+)(?:[\s:](\d+)(?:[\s\-–](\d+))?)?$/);
    if (!m) return null;
    const book = aliasMap[m[1].toLowerCase()] || aliasMap[m[1]];
    if (!book) return null;
    const chapter = parseInt(m[2], 10);
    const start = m[3] ? parseInt(m[3], 10) : undefined;
    const end   = m[4] ? parseInt(m[4], 10) : start;
    const bookName = names[book - 1];
    let reference = bookName + ' ' + chapter + ' 章';
    if (start) reference += ' ' + start + (end && end !== start ? '–' + end : '') + ' 节';
    return { book, chapter, start, end, reference };
  }

  window.PMBible = { mount, parseRef, setDrawerState };
})();
