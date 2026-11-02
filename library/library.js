const state = { papers: [], folders: [], tags: [], paperTags: {}, selected: 'all', openPaper: null, paperView: 'main', openFolder: null, snapshot: '' };
const icons = {
  all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5c2.8-.6 5.5 0 8 1.6v14c-2.5-1.6-5.2-2.2-8-1.6zM20 4.5c-2.8-.6-5.5 0-8 1.6v14c2.5-1.6 5.2-2.2 8-1.6z"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 4.5-4 3 2.5 3.5-4 5 5"/></svg>'
};
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const el = id => document.getElementById(id);
const countPapers = folder => folder.papers.filter(id => state.papers.some(paper => paper.id === id)).length;
const tagColors = [['红色','#e45462'], ['橙色','#e99549'], ['黄色','#e9b949'], ['绿色','#3eaf80'], ['蓝色','#4f8ddd'], ['紫色','#665af4'], ['粉色','#d36ba3']];
const progressKey = id => `paper-reader:progress:${id}`;
const openedKey = id => `paper-reader:opened:${id}`;

function readingProgress(id) {
  try {
    const value = Number(JSON.parse(localStorage.getItem(progressKey(id)) || '{}').percent);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  } catch { return 0; }
}

function lastOpened(id) {
  try { return Number(localStorage.getItem(openedKey(id))) || 0; }
  catch { return 0; }
}

function updateProgress(id = null) {
  document.querySelectorAll('.paper-card[data-paper-id]').forEach(card => {
    if (id && card.dataset.paperId !== id) return;
    const percent = readingProgress(card.dataset.paperId);
    const cover = card.querySelector('.cover-area');
    const link = card.querySelector('.card-link');
    cover.style.setProperty('--reading-progress', `${percent}%`);
    cover.title = `阅读进度：${percent}%`;
    link.setAttribute('aria-label', `阅读 ${card.querySelector('.paper-title').title}，阅读进度 ${percent}%`);
  });
}

function sortCards() {
  const grid = el('paper-grid');
  [...grid.children].sort((a, b) => lastOpened(b.dataset.paperId) - lastOpened(a.dataset.paperId))
    .forEach(card => grid.append(card));
}

function tagPalette(selected, tagId = '') {
  return `<div class="tag-palette" role="group" aria-label="标准颜色"><span class="tag-palette-label">标准色</span>${tagColors.map(([name, value]) => `<button type="button" class="tag-preset" style="background-color:${value}" data-tag-preset="${value}" ${tagId ? `data-tag-id="${escapeHTML(tagId)}"` : ''} aria-label="${name}" title="${name}" aria-pressed="${selected.toLowerCase() === value}"></button>`).join('')}${tagId ? `<input class="tag-color" type="color" value="${escapeHTML(selected)}" data-tag-color="${escapeHTML(tagId)}" aria-label="自定义标签颜色（全库同步）" title="自定义颜色，所有文献同步">` : ''}</div>`;
}

function renderNavigation() {
  el('navigation').innerHTML = `<button type="button" class="nav-button ${state.selected === 'all' ? 'active' : ''}" data-select="all"><span class="nav-icon">${icons.all}</span><span>全部文献</span><span class="nav-count">${state.papers.length}</span></button>`;
  el('folders').innerHTML = state.folders.map(folder => `
    <div class="folder-row">
      <button type="button" class="folder-button ${state.selected === folder.id ? 'active' : ''}" data-select="${escapeHTML(folder.id)}"><span class="nav-icon">${icons.folder}</span><span>${escapeHTML(folder.name)}</span><span class="nav-count">${countPapers(folder)}</span></button>
      <button type="button" class="icon-button folder-more" data-folder-more="${escapeHTML(folder.id)}" aria-label="管理文件夹 ${escapeHTML(folder.name)}" aria-expanded="${state.openFolder === folder.id}">⋯</button>
      ${state.openFolder === folder.id ? `<div class="folder-menu"><button type="button" data-rename="${escapeHTML(folder.id)}">重命名</button><button type="button" class="danger" data-delete="${escapeHTML(folder.id)}">删除文件夹</button></div>` : ''}
    </div>`).join('');
}

function renderPapers() {
  const folder = state.folders.find(item => item.id === state.selected);
  const visible = (folder ? state.papers.filter(paper => folder.papers.includes(paper.id)) : [...state.papers])
    .sort((a, b) => lastOpened(b.id) - lastOpened(a.id));
  el('view-title').textContent = folder ? folder.name : '全部文献';
  el('paper-count').textContent = `共 ${visible.length} 篇文献`;
  el('empty-state').hidden = visible.length > 0;
  el('empty-state').innerHTML = folder
    ? '<strong>文件夹里还没有文献</strong>使用论文卡片右上角的菜单，将文献添加到这里。'
    : '<strong>文献库里还没有论文</strong>完成论文翻译后，阅读文件夹会自动显示在这里。';
  el('paper-grid').innerHTML = visible.map(paper => {
    const assigned = state.paperTags[paper.id] || [];
    const dots = assigned.slice(-3).reverse().map(id => state.tags.find(tag => tag.id === id)).filter(Boolean);
    let menu = '';
    if (state.openPaper === paper.id) {
      if (state.paperView === 'main') {
        menu = '<div class="paper-menu"><button type="button" class="paper-menu-option" data-paper-view="tags">管理标签</button><button type="button" class="paper-menu-option" data-paper-view="folders">文件夹管理</button></div>';
      } else if (state.paperView === 'folders') {
        menu = `<div class="paper-menu"><button type="button" class="menu-back" data-paper-view="main">← 返回</button><p class="menu-title">文件夹管理</p>
          ${state.folders.length ? `<div class="folder-checks">${state.folders.map(item => `<label class="folder-check"><input type="checkbox" data-membership="${escapeHTML(item.id)}" data-paper-id="${escapeHTML(paper.id)}" ${item.papers.includes(paper.id) ? 'checked' : ''}><span>${escapeHTML(item.name)}</span></label>`).join('')}</div>` : '<p class="menu-hint">请先在左侧新建文件夹。</p>'}</div>`;
      } else {
        menu = `<div class="paper-menu"><button type="button" class="menu-back" data-paper-view="main">← 返回</button><p class="menu-title">管理标签</p>
          ${state.tags.length ? `<div class="folder-checks">${state.tags.map(tag => `<div class="tag-entry"><div class="tag-row"><label class="folder-check tag-label"><input type="checkbox" data-tag-membership="${escapeHTML(tag.id)}" data-paper-id="${escapeHTML(paper.id)}" ${assigned.includes(tag.id) ? 'checked' : ''}><span title="${escapeHTML(tag.name)}">${escapeHTML(tag.name)}</span></label><button type="button" class="tag-color tag-color-trigger" style="background-color:${escapeHTML(tag.color)}" data-color-toggle aria-label="修改 ${escapeHTML(tag.name)} 的颜色（全库同步）" title="选择颜色，所有文献同步" aria-expanded="false"></button></div><div class="tag-color-options" hidden>${tagPalette(tag.color, tag.id)}</div></div>`).join('')}</div><p class="menu-hint">修改颜色会同步所有文献。</p>` : '<p class="menu-hint">还没有标签，可以在下方创建。</p>'}
          <form class="tag-create" data-tag-create="${escapeHTML(paper.id)}"><input name="name" maxlength="80" required placeholder="新标签名称" aria-label="新标签名称"><input type="color" name="color" value="#665af4" aria-label="新标签自定义颜色" title="自定义颜色"><button type="submit">添加</button>${tagPalette('#665af4')}</form></div>`;
      }
    }
    const percent = readingProgress(paper.id);
    return `<article class="paper-card ${state.openPaper === paper.id ? 'menu-open' : ''}" data-paper-id="${escapeHTML(paper.id)}">
      <a class="card-link" href="${escapeHTML(paper.reader)}" aria-label="阅读 ${escapeHTML(paper.title)}，阅读进度 ${percent}%">
        <div class="cover-area" style="--reading-progress:${percent}%" title="阅读进度：${percent}%">${paper.cover ? `<div class="cover-frame"><img class="cover-image" src="${escapeHTML(paper.cover)}" alt="论文代表图"></div>` : `<div class="cover-placeholder">${icons.image}<span>暂无代表图</span></div>`}</div>
        <div class="paper-info"><h2 class="paper-title" title="${escapeHTML(paper.title)}">${escapeHTML(paper.title)}</h2><div class="paper-author" title="${escapeHTML(paper.authors)}"><strong>作者：</strong>${escapeHTML(paper.authors || '未注明')}</div></div>
      </a>
      ${dots.length ? `<div class="paper-tags" aria-label="论文标签">${dots.map(tag => `<span class="paper-tag-dot" style="background-color:${escapeHTML(tag.color)}" title="${escapeHTML(tag.name)}" role="img" aria-label="标签：${escapeHTML(tag.name)}" tabindex="0"></span>`).join('')}</div>` : ''}
      <button type="button" class="card-more" data-paper-more="${escapeHTML(paper.id)}" aria-label="管理 ${escapeHTML(paper.title)}" aria-expanded="${state.openPaper === paper.id}">⋯</button>
      ${menu}
    </article>`;
  }).join('');
  updateCoverHeight();
}

function render() { renderNavigation(); renderPapers(); }

function updateCoverHeight() {
  const images = [...document.querySelectorAll('.cover-image')].filter(image => image.naturalWidth && image.naturalHeight);
  if (!images.length) return;
  const height = Math.min(...images.map(image => {
    const area = image.closest('.cover-area');
    const style = getComputedStyle(area);
    const width = Math.min(320, area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availableHeight = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const ratio = image.naturalWidth / image.naturalHeight;
    return Math.min(availableHeight, width / ratio);
  }));
  el('paper-grid').style.setProperty('--cover-height', `${Math.floor(height)}px`);
}

document.addEventListener('load', event => {
  if (event.target.classList?.contains('cover-image')) updateCoverHeight();
}, true);
window.addEventListener('resize', updateCoverHeight);

function recordOpen(event) {
  if (event.type === 'auxclick' && event.button !== 1) return;
  const card = event.target.closest('.card-link')?.closest('.paper-card');
  if (!card) return;
  try { localStorage.setItem(openedKey(card.dataset.paperId), String(Date.now())); }
  catch { return; }
  setTimeout(sortCards, 0);
}

document.addEventListener('click', recordOpen, true);
document.addEventListener('auxclick', recordOpen, true);
window.addEventListener('storage', event => {
  if (event.key?.startsWith('paper-reader:opened:')) sortCards();
  else if (event.key?.startsWith('paper-reader:progress:')) updateProgress(event.key.slice('paper-reader:progress:'.length));
});
window.addEventListener('pageshow', () => { sortCards(); updateProgress(); });

async function refresh(force = false) {
  try {
    const response = await fetch('/api/library', {cache:'no-store'});
    if (!response.ok) throw new Error('无法读取文献库。');
    const data = await response.json();
    const snapshot = JSON.stringify(data);
    if (force || snapshot !== state.snapshot) {
      state.papers = data.papers;
      state.folders = data.folders;
      state.tags = data.tags || [];
      state.paperTags = data.paper_tags || {};
      state.snapshot = snapshot;
      if (state.selected !== 'all' && !state.folders.some(folder => folder.id === state.selected)) state.selected = 'all';
      render();
    }
  } catch (error) {
    el('message').textContent = error.message;
  }
}

async function change(action, payload, kind = 'folders') {
  const response = await fetch(`/api/${kind}/${action}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作未完成，请重试。');
  el('message').textContent = '';
  await refresh(true);
}

const dialog = el('folder-dialog');
let editingFolder = null;
function openFolderDialog(folder = null) {
  editingFolder = folder;
  el('dialog-title').textContent = folder ? '重命名文件夹' : '新建文件夹';
  el('folder-name').value = folder ? folder.name : '';
  el('dialog-error').textContent = '';
  state.openFolder = null;
  renderNavigation();
  dialog.showModal();
  el('folder-name').focus();
}

el('add-folder').addEventListener('click', () => openFolderDialog());
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => dialog.close()));
el('folder-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await change(editingFolder ? 'rename' : 'create', {folder_id:editingFolder?.id, name:el('folder-name').value});
    dialog.close();
  } catch (error) { el('dialog-error').textContent = error.message; }
});

document.addEventListener('click', async event => {
  const select = event.target.closest('[data-select]');
  const paperMore = event.target.closest('[data-paper-more]');
  const folderMore = event.target.closest('[data-folder-more]');
  const rename = event.target.closest('[data-rename]');
  const remove = event.target.closest('[data-delete]');
  const paperView = event.target.closest('[data-paper-view]');
  const colorToggle = event.target.closest('[data-color-toggle]');
  const preset = event.target.closest('[data-tag-preset]');
  if (select) {
    state.selected = select.dataset.select;
    state.openPaper = null; state.openFolder = null; render();
  } else if (paperMore) {
    state.openPaper = state.openPaper === paperMore.dataset.paperMore ? null : paperMore.dataset.paperMore;
    state.paperView = 'main'; state.openFolder = null; render();
  } else if (paperView) {
    state.paperView = paperView.dataset.paperView; renderPapers();
  } else if (colorToggle) {
    const options = colorToggle.closest('.tag-entry').querySelector('.tag-color-options');
    options.hidden = !options.hidden;
    colorToggle.setAttribute('aria-expanded', String(!options.hidden));
  } else if (preset) {
    if (preset.dataset.tagId) {
      try { await change('color', {tag_id:preset.dataset.tagId, color:preset.dataset.tagPreset}, 'tags'); }
      catch (error) { el('message').textContent = error.message; }
    } else {
      const form = preset.closest('form');
      form.elements.namedItem('color').value = preset.dataset.tagPreset;
      form.querySelectorAll('[data-tag-preset]').forEach(button => button.setAttribute('aria-pressed', String(button === preset)));
    }
  } else if (folderMore) {
    state.openFolder = state.openFolder === folderMore.dataset.folderMore ? null : folderMore.dataset.folderMore;
    state.openPaper = null; render();
  } else if (rename) {
    openFolderDialog(state.folders.find(folder => folder.id === rename.dataset.rename));
  } else if (remove) {
    const folder = state.folders.find(item => item.id === remove.dataset.delete);
    if (folder && confirm(`删除文件夹“${folder.name}”？\n论文文件不会被删除。`)) {
      try { state.openFolder = null; await change('delete', {folder_id:folder.id}); }
      catch (error) { el('message').textContent = error.message; }
    }
  } else if (!event.target.closest('.paper-menu, .folder-menu, dialog')) {
    if (state.openPaper || state.openFolder) { state.openPaper = null; state.openFolder = null; render(); }
  }
});

document.addEventListener('change', async event => {
  const checkbox = event.target.closest('[data-membership]');
  const tagCheckbox = event.target.closest('[data-tag-membership]');
  const color = event.target.closest('[data-tag-color]');
  try {
    if (checkbox) await change('membership', {folder_id:checkbox.dataset.membership, paper_id:checkbox.dataset.paperId, selected:checkbox.checked});
    else if (tagCheckbox) await change('membership', {tag_id:tagCheckbox.dataset.tagMembership, paper_id:tagCheckbox.dataset.paperId, selected:tagCheckbox.checked}, 'tags');
    else if (color) await change('color', {tag_id:color.dataset.tagColor, color:color.value}, 'tags');
  } catch (error) {
    if (checkbox || tagCheckbox) (checkbox || tagCheckbox).checked = !(checkbox || tagCheckbox).checked;
    el('message').textContent = error.message;
  }
});

document.addEventListener('input', event => {
  const input = event.target.closest('.tag-create input[name="color"]');
  if (!input) return;
  input.form.querySelectorAll('[data-tag-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tagPreset === input.value)));
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-tag-create]');
  if (!form) return;
  event.preventDefault();
  try { await change('create', {paper_id:form.dataset.tagCreate, name:form.elements.namedItem('name').value, color:form.elements.namedItem('color').value}, 'tags'); }
  catch (error) { el('message').textContent = error.message; }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !dialog.open && (state.openPaper || state.openFolder)) {
    state.openPaper = null; state.openFolder = null; render();
  }
});

refresh();
setInterval(refresh, 5000);
