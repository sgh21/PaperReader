(() => {
  const paper = decodeURIComponent(location.pathname.split('/')[2]);
  const titleId = '__paper_title__';
  const state = {notes: [], positions: new Map(), selection: null, editing: null, previewTimer: null};
  const colors = {yellow:'黄色', green:'绿色', blue:'蓝色', purple:'紫色', pink:'粉色'};
  const colorValues = {yellow:'#ffe78a', green:'#b9e9c0', blue:'#b9ddff', purple:'#d8c6f7', pink:'#ffd0dc'};
  const el = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  document.querySelector('header.top').insertAdjacentHTML('beforeend',
    '<button type="button" id="nr-toggle" class="nr-toggle" aria-controls="nr-panel">批注<span class="nr-count" id="nr-count">0</span></button>');
  document.body.insertAdjacentHTML('beforeend', `
    <button type="button" id="nr-selection" class="nr-selection" hidden>添加批注</button>
    <div id="nr-preview" class="nr-preview" role="tooltip" hidden></div>
    <aside id="nr-panel" class="nr-panel" aria-label="本篇批注" hidden>
      <div class="nr-panel-head"><strong>本篇批注</strong><small>按文章顺序排列</small><button type="button" class="nr-close" id="nr-panel-close" aria-label="关闭批注">×</button></div>
      <div class="nr-panel-list" id="nr-list"></div>
    </aside>
    <dialog id="nr-dialog" class="nr-dialog">
      <form id="nr-form">
        <div class="nr-dialog-head"><h2 id="nr-dialog-title">添加批注</h2><button type="button" class="nr-close" id="nr-dialog-close" aria-label="关闭">×</button></div>
        <div id="nr-quote" class="nr-dialog-quote"></div>
        <label class="nr-label" for="nr-type">类型</label>
        <select id="nr-type"><option>疑问</option><option>收获</option><option>评论</option></select>
        <span class="nr-label">颜色</span>
        <div class="nr-colors">${Object.entries(colors).map(([value, label]) => `<label class="nr-color-choice"><input type="radio" name="nr-color" value="${value}" aria-label="${label}"><span class="nr-dot nr-${value}"></span></label>`).join('')}</div>
        <label class="nr-label" for="nr-content">批注内容</label>
        <textarea id="nr-content" required placeholder="写下你的疑问、收获或评论…"></textarea>
        <p class="nr-dialog-error" id="nr-error" role="alert"></p>
        <div class="nr-actions"><button type="button" id="nr-delete" class="nr-delete" hidden>删除</button><button type="button" id="nr-cancel" class="nr-cancel">取消</button><button type="submit" class="nr-save">保存</button></div>
      </form>
    </dialog>`);

  async function request(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '无法保存批注。');
    return data;
  }

  function textPosition(paragraph, range, start) {
    const before = document.createRange();
    before.selectNodeContents(paragraph);
    before.setEnd(start ? range.startContainer : range.endContainer, start ? range.startOffset : range.endOffset);
    return before.toString().length;
  }

  function paragraphFor(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element?.closest('.pair .en p, .pair .zh p, figure.figure figcaption .en p, figure.figure figcaption .zh p, .section-heading > h2, .section-heading > h3, .section-heading > .section-zh, .paper > h1, .paper > .title-zh');
  }

  function paragraphInfo(paragraph) {
    if (paragraph.matches('.paper > h1, .paper > .title-zh')) {
      return {blockId:titleId, language:paragraph.matches('h1') ? 'en' : 'zh'};
    }
    const section = paragraph.closest('.section-heading[id]');
    if (section) return {blockId:section.id, language:paragraph.matches('.section-zh') ? 'zh' : 'en'};
    const block = paragraph.closest('.pair[id], figure.figure[id]');
    return {blockId:block.id, language:paragraph.closest('.en, .zh').classList.contains('en') ? 'en' : 'zh'};
  }

  function targets(note) {
    const block = note.block_id === titleId ? document.querySelector('main.paper') : document.getElementById(note.block_id);
    if (!block) return {};
    const other = note.language === 'zh' ? 'en' : 'zh';
    if (note.block_id === titleId) {
      const title = language => block.querySelector(language === 'en' ? ':scope > h1' : ':scope > .title-zh');
      return {block, paragraph:title(note.language), opposite:title(other)};
    }
    if (block.classList.contains('section-heading')) {
      const heading = language => block.querySelector(language === 'en' ? 'h2, h3' : '.section-zh');
      return {block, paragraph:heading(note.language), opposite:heading(other)};
    }
    return {block, paragraph:block.querySelector(`.${note.language} p`), opposite:block.querySelector(`.${other} .lang-label`)};
  }

  function getSelectionData() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const paragraph = paragraphFor(range.startContainer);
    if (!paragraph || paragraph !== paragraphFor(range.endContainer)) return null;
    const {blockId, language} = paragraphInfo(paragraph);
    const start = textPosition(paragraph, range, true);
    const end = textPosition(paragraph, range, false);
    const text = paragraph.textContent;
    const quote = text.slice(start, end);
    if (!quote.trim()) return null;
    return {block_id:blockId, language, start, end, quote,
      prefix:text.slice(Math.max(0, start - 24), start), suffix:text.slice(end, end + 24), range:range.cloneRange()};
  }

  function showSelectionButton() {
    if (el('nr-dialog').open) return;
    const selected = getSelectionData();
    const button = el('nr-selection');
    state.selection = selected;
    button.hidden = !selected;
    if (selected) {
      const rect = selected.range.getBoundingClientRect();
      button.style.left = `${Math.max(8, Math.min(innerWidth - 110, rect.left))}px`;
      button.style.top = `${Math.max(8, Math.min(innerHeight - 46, rect.top - 42))}px`;
    }
  }

  document.addEventListener('mouseup', event => {
    if (!event.target.closest('#nr-selection, #nr-dialog, #nr-panel, #nr-preview')) setTimeout(showSelectionButton, 0);
  });
  document.addEventListener('keyup', event => {
    if (event.shiftKey) showSelectionButton();
  });
  el('nr-selection').addEventListener('mousedown', event => event.preventDefault());
  el('nr-selection').addEventListener('click', () => {
    if (state.selection) openEditor(null);
  });

  function locate(note, paragraph) {
    if (!paragraph || !note.quote) return null;
    const text = paragraph.textContent;
    if (text.slice(note.start, note.end) === note.quote) return {start:note.start, end:note.end};
    const matches = [];
    for (let index = text.indexOf(note.quote); index !== -1; index = text.indexOf(note.quote, index + 1)) matches.push(index);
    if (matches.length === 1) return {start:matches[0], end:matches[0] + note.quote.length};
    const contextual = matches.filter(index =>
      (!note.prefix || text.slice(Math.max(0, index - note.prefix.length), index) === note.prefix) &&
      (!note.suffix || text.slice(index + note.quote.length, index + note.quote.length + note.suffix.length) === note.suffix));
    return contextual.length === 1 ? {start:contextual[0], end:contextual[0] + note.quote.length} : null;
  }

  function clearMarks() {
    document.querySelectorAll('mark.nr-mark').forEach(mark => mark.replaceWith(...mark.childNodes));
    document.querySelectorAll('.nr-links').forEach(links => links.remove());
    document.querySelectorAll('.pair p, figure.figure figcaption p, .section-heading > h2, .section-heading > h3, .section-heading > .section-zh, .paper > h1, .paper > .title-zh').forEach(paragraph => paragraph.normalize());
  }

  function paint(paragraph, items) {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let offset = 0;
    nodes.forEach(node => {
      const text = node.nodeValue;
      const boundaries = new Set([0, text.length]);
      items.forEach(item => {
        if (item.start > offset && item.start < offset + text.length) boundaries.add(item.start - offset);
        if (item.end > offset && item.end < offset + text.length) boundaries.add(item.end - offset);
      });
      const points = [...boundaries].sort((a, b) => a - b);
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < points.length - 1; i++) {
        const start = offset + points[i], end = offset + points[i + 1];
        const active = items.filter(item => item.start < end && item.end > start);
        const value = text.slice(points[i], points[i + 1]);
        if (active.length) {
          const mark = document.createElement('mark');
          mark.className = `nr-mark nr-${active[0].note.color}`;
          const shades = [...new Set(active.map(item => colorValues[item.note.color]))];
          if (shades.length > 1) {
            mark.style.background = `linear-gradient(to bottom, ${shades.map((shade, index) => `${shade} ${100 * index / shades.length}% ${100 * (index + 1) / shades.length}%`).join(', ')})`;
          }
          mark.dataset.noteIds = active.map(item => item.note.id).join(',');
          mark.tabIndex = 0;
          mark.textContent = value;
          fragment.append(mark);
        } else fragment.append(document.createTextNode(value));
      }
      node.replaceWith(fragment);
      offset += text.length;
    });
  }

  function renderNotes() {
    clearMarks();
    state.positions.clear();
    const groups = new Map();
    state.notes.forEach(note => {
      const {block, paragraph, opposite} = targets(note);
      const position = locate(note, paragraph);
      if (!position) return;
      state.positions.set(note.id, {block, paragraph, ...position});
      if (!groups.has(paragraph)) groups.set(paragraph, []);
      groups.get(paragraph).push({note, ...position});
      if (opposite) {
        let links = opposite.querySelector('.nr-links');
        if (!links) { links = document.createElement('span'); links.className = 'nr-links'; opposite.append(links); }
        const marker = document.createElement('button');
        marker.type = 'button'; marker.className = `nr-linked nr-${note.color}`;
        marker.dataset.noteIds = note.id;
        marker.setAttribute('aria-label', `${note.type}：查看对应${note.language === 'zh' ? '中文' : '英文'}批注`);
        links.append(marker);
      }
    });
    groups.forEach((items, paragraph) => paint(paragraph, items));
    el('nr-count').textContent = state.notes.length;
    const list = el('nr-list');
    if (!state.notes.length) {
      list.innerHTML = '<p class="nr-empty">还没有批注。选中标题或段落中的文字，即可添加。</p>';
      return;
    }
    list.innerHTML = state.notes.map(note => `
      <article class="nr-card">
        <div class="nr-card-top"><span class="nr-dot nr-${escape(note.color)}"></span><strong>${escape(note.type)}</strong><span>${note.page ? `PDF 第 ${escape(note.page)} 页` : '论文标题'} · ${note.language === 'zh' ? '中文' : '英文'}</span>${state.positions.has(note.id) ? '' : '<span class="nr-unresolved">位置待确认</span>'}</div>
        <div class="nr-card-quote">${escape(note.quote)}</div><div class="nr-card-content">${escape(note.content)}</div>
        <div class="nr-card-actions"><button type="button" data-nr-jump="${escape(note.id)}" ${state.positions.has(note.id) ? '' : 'disabled'}>定位</button><button type="button" data-nr-edit="${escape(note.id)}">编辑</button></div>
      </article>`).join('');
  }

  async function loadNotes() {
    try {
      const data = await request(`/api/notes?paper=${encodeURIComponent(paper)}`, {cache:'no-store'});
      state.notes = data.notes;
      renderNotes();
    } catch (error) {
      el('nr-list').textContent = `无法读取批注：${error.message}`;
    }
  }

  function noteById(id) { return state.notes.find(note => note.id === id); }
  function openEditor(note) {
    state.editing = note;
    el('nr-dialog-title').textContent = note ? '编辑批注' : '添加批注';
    el('nr-quote').textContent = note ? note.quote : state.selection.quote;
    el('nr-type').value = note?.type || '疑问';
    el('nr-content').value = note?.content || '';
    document.querySelector(`input[name="nr-color"][value="${note?.color || 'yellow'}"]`).checked = true;
    el('nr-delete').hidden = !note;
    el('nr-error').textContent = '';
    el('nr-selection').hidden = true;
    el('nr-preview').hidden = true;
    el('nr-dialog').showModal();
    el('nr-content').focus();
  }

  async function submit(action) {
    const note = state.editing;
    const selected = state.selection;
    const payload = action === 'create'
      ? {block_id:selected.block_id, language:selected.language, start:selected.start, end:selected.end, quote:selected.quote, prefix:selected.prefix, suffix:selected.suffix}
      : {id:note.id, revision:note.revision, previous_content:note.content};
    if (action !== 'delete') {
      payload.type = el('nr-type').value;
      payload.color = document.querySelector('input[name="nr-color"]:checked').value;
      payload.content = el('nr-content').value;
    }
    const data = await request('/api/notes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paper_id:paper, action, note:payload})});
    state.notes = data.notes;
    renderNotes();
    el('nr-dialog').close();
    window.getSelection()?.removeAllRanges();
  }

  el('nr-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { await submit(state.editing ? 'update' : 'create'); }
    catch (error) { el('nr-error').textContent = error.message; }
  });
  el('nr-delete').addEventListener('click', async () => {
    if (!confirm('删除这条批注？')) return;
    try { await submit('delete'); }
    catch (error) { el('nr-error').textContent = error.message; }
  });
  el('nr-dialog-close').addEventListener('click', () => el('nr-dialog').close());
  el('nr-cancel').addEventListener('click', () => el('nr-dialog').close());
  el('nr-toggle').addEventListener('click', () => { el('nr-panel').hidden = !el('nr-panel').hidden; });
  el('nr-panel-close').addEventListener('click', () => { el('nr-panel').hidden = true; });

  el('nr-list').addEventListener('click', event => {
    const edit = event.target.closest('[data-nr-edit]');
    if (edit) { openEditor(noteById(edit.dataset.nrEdit)); return; }
    const jump = event.target.closest('[data-nr-jump]');
    if (!jump) return;
    const note = noteById(jump.dataset.nrJump);
    const position = state.positions.get(note.id);
    if (!position) return;
    if (getComputedStyle(position.paragraph).display === 'none' || !position.paragraph.getClientRects().length) {
      document.querySelector('.controls [data-mode="both"]')?.click();
    }
    el('nr-panel').hidden = true;
    const mark = [...position.block.querySelectorAll('mark.nr-mark')].find(item => item.dataset.noteIds.split(',').includes(note.id));
    (mark || position.block).scrollIntoView({behavior:'smooth', block:'center'});
  });

  function showPreview(target) {
    clearTimeout(state.previewTimer);
    const notes = target.dataset.noteIds.split(',').map(noteById).filter(Boolean);
    const preview = el('nr-preview');
    preview.innerHTML = notes.map(note => `<div class="nr-preview-item"><div class="nr-preview-type"><span class="nr-dot nr-${escape(note.color)}"></span> ${escape(note.type)}</div><div class="nr-preview-content">${escape(note.content)}</div><button type="button" class="nr-preview-action" data-nr-edit="${escape(note.id)}">查看或编辑</button></div>`).join('');
    preview.hidden = false;
    const rect = target.getBoundingClientRect();
    preview.style.left = `${Math.max(8, Math.min(innerWidth - preview.offsetWidth - 8, rect.left))}px`;
    preview.style.top = `${Math.max(8, Math.min(innerHeight - preview.offsetHeight - 8, rect.bottom + 6))}px`;
  }
  function hidePreviewSoon() { state.previewTimer = setTimeout(() => { el('nr-preview').hidden = true; }, 180); }
  document.addEventListener('pointerover', event => {
    const target = event.target.closest('[data-note-ids]');
    if (target) showPreview(target);
    else if (event.target.closest('#nr-preview')) clearTimeout(state.previewTimer);
  });
  document.addEventListener('pointerout', event => {
    if (event.target.closest('[data-note-ids], #nr-preview') && !event.relatedTarget?.closest?.('[data-note-ids], #nr-preview')) hidePreviewSoon();
  });
  document.addEventListener('focusin', event => {
    const target = event.target.closest('[data-note-ids]');
    if (target) showPreview(target);
  });
  document.addEventListener('click', event => {
    const edit = event.target.closest('#nr-preview [data-nr-edit]');
    if (edit) { openEditor(noteById(edit.dataset.nrEdit)); return; }
    const target = event.target.closest('[data-note-ids]');
    if (target && window.getSelection()?.isCollapsed) {
      event.preventDefault();
      openEditor(noteById(target.dataset.noteIds.split(',')[0]));
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !el('nr-dialog').open) { el('nr-preview').hidden = true; el('nr-selection').hidden = true; }
  });
  loadNotes();
})();

// 阅读进度与批注一样，通过本地服务加载到现有阅读页。
(() => {
  const paper = decodeURIComponent(location.pathname.split('/')[2]);
  const key = `paper-reader:progress:${paper}`;
  const blocks = [...document.querySelectorAll('.paper .section-heading[id], .paper .pair[id], .paper figure.figure[id]')];
  const readingLine = 80;
  let ready = false;
  let timer;

  function save() {
    if (!ready) return;
    let block = null;
    for (const item of blocks) {
      if (item.getBoundingClientRect().top > readingLine) break;
      block = item;
    }
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const percent = maxScroll > 0 ? Math.round(Math.max(0, Math.min(1, scrollY / maxScroll)) * 100) : 0;
    const offset = block ? (readingLine - block.getBoundingClientRect().top) / Math.max(1, block.offsetHeight) : 0;
    try { localStorage.setItem(key, JSON.stringify({block: block?.id || '', offset, percent})); }
    catch { /* 阅读网页仍可继续使用。 */ }
  }

  window.addEventListener('scroll', () => {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  }, {passive:true});
  window.addEventListener('pagehide', save);

  async function restore() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { saved = null; }
    if (saved && !location.hash) {
      const block = saved.block && document.getElementById(saved.block);
      if (block) {
        const images = [...document.querySelectorAll('.paper img')].filter(image =>
          !image.complete && (block.contains(image) || (image.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)));
        await Promise.all(images.map(image => {
          image.loading = 'eager';
          return image.decode().catch(() => {});
        }));
        const top = block.getBoundingClientRect().top + scrollY + (Number(saved.offset) || 0) * block.offsetHeight - readingLine;
        window.scrollTo({top, behavior:'instant'});
      } else {
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        window.scrollTo({top:maxScroll * (Number(saved.percent) || 0) / 100, behavior:'instant'});
      }
    }
    ready = true;
  }
  restore();
})();
