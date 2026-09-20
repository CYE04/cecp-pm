(function () {
  'use strict';
  const { el, button, json, retry } = window.PMFeatures;
  const names = '创世记 出埃及记 利未记 民数记 申命记 约书亚记 士师记 路得记 撒母耳记上 撒母耳记下 列王纪上 列王纪下 历代志上 历代志下 以斯拉记 尼希米记 以斯帖记 约伯记 诗篇 箴言 传道书 雅歌 以赛亚书 耶利米书 耶利米哀歌 以西结书 但以理书 何西阿书 约珥书 阿摩司书 俄巴底亚书 约拿书 弥迦书 那鸿书 哈巴谷书 西番雅书 哈该书 撒迦利亚书 玛拉基书 马太福音 马可福音 路加福音 约翰福音 使徒行传 罗马书 哥林多前书 哥林多后书 加拉太书 以弗所书 腓立比书 歌罗西书 帖撒罗尼迦前书 帖撒罗尼迦后书 提摩太前书 提摩太后书 提多书 腓利门书 希伯来书 雅各书 彼得前书 彼得后书 约翰一书 约翰二书 约翰三书 犹大书 启示录'.split(' ');
  const chapters = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
  let serial = 0;

  function mount(host, passage, endpoint) {
    if (!Number.isInteger(passage.book) || !names[passage.book - 1] || !Number.isInteger(passage.chapter) || passage.chapter < 1 || passage.chapter > chapters[passage.book - 1]) return;
    const id = 'pm-bible-' + ++serial;
    const details = el('details', 'bible-reader');
    const summary = el('summary', '', '展开经文');
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
    details.append(form, title, tools, feedback, content, pager);
    books.addEventListener('change', () => { chapter.max = chapters[+books.value - 1]; chapter.value = 1; });
    form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) load(+books.value, +chapter.value); });
    details.addEventListener('toggle', () => {
      summary.textContent = details.open ? '收起经文' : '展开经文';
      if (details.open && !started) { started = true; load(passage.book, passage.chapter, passage); }
    });
    host.appendChild(details);
  }
  window.PMBible = { mount };
})();
