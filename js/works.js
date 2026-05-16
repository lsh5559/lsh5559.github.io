/* ─────────────────────────────────────────────
   works.js · 게시판 CRUD + 코드 출력 + 코드 불러오기
   GitHub Pages 대응: IndexedDB + 이미지 URL 입력 방식
   ───────────────────────────────────────────── */

const DB_NAME    = 'portfolio_db';
const DB_VERSION = 1;
const STORE_NAME = 'works';

/* ── IndexedDB ── */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function getPosts() {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = e => reject(e.target.error);
  }));
}

function savePost(post) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(post);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  }));
}

function deletePostFromDB(id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  }));
}

function clearDB() {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  }));
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function unesc(str) {
  return String(str)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

/* ── 렌더링 ── */
function renderPosts() {
  getPosts().then(posts => {
    posts.sort((a, b) => (a.id < b.id ? -1 : 1));
    const list = document.getElementById('works-list');

    if (posts.length === 0) {
      list.innerHTML = `<div class="works-empty">아직 작업물이 없습니다</div>`;
      return;
    }

    list.innerHTML = posts.map((post, idx) => `
      <article class="post-card" data-id="${post.id}">
        <div class="post-image-wrap">
          ${post.image
            ? `<img src="${esc(post.image)}" alt="${esc(post.title)}">`
            : `<div style="width:100%;height:100%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;color:#333;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;">이미지 없음</div>`}
        </div>
        <div class="post-info">
          <span class="post-number">0${idx + 1}</span>
          <h2 class="post-title">${esc(post.title)}</h2>
          <p class="post-desc">${esc(post.description)}</p>
          <div class="post-actions">
            <button class="btn-post-edit"   data-id="${post.id}">편집</button>
            <button class="btn-post-delete" data-id="${post.id}">삭제</button>
          </div>
        </div>
      </article>
    `).join('');

    list.querySelectorAll('.btn-post-edit')  .forEach(b => b.addEventListener('click', () => openModal(b.dataset.id)));
    list.querySelectorAll('.btn-post-delete').forEach(b => b.addEventListener('click', () => deletePost(b.dataset.id)));
  });
}

function deletePost(id) {
  if (!confirm('이 작업물을 삭제하시겠습니까?')) return;
  deletePostFromDB(id).then(renderPosts);
}

/* ── 모달 ── */
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const formTitle    = document.getElementById('form-title');
const formDesc     = document.getElementById('form-desc');
const formImageUrl = document.getElementById('form-image-url');
const imgPreview   = document.getElementById('img-preview');

let editingId    = null;
let currentImage = null;

function openModal(id = null) {
  editingId = id; currentImage = null;

  if (id) {
    getPosts().then(posts => {
      const post = posts.find(p => p.id === id);
      if (!post) return;
      modalTitle.textContent = '작업물 편집';
      formTitle.value        = post.title;
      formDesc.value         = post.description;
      formImageUrl.value     = post.image || '';
      currentImage           = post.image || null;
      if (currentImage) { imgPreview.src = currentImage; imgPreview.classList.add('visible'); }
      else { imgPreview.classList.remove('visible'); }
      modalOverlay.classList.add('active');
    });
  } else {
    modalTitle.textContent = '새 작업물 추가';
    formTitle.value        = '';
    formDesc.value         = '';
    formImageUrl.value     = '';
    imgPreview.classList.remove('visible');
    modalOverlay.classList.add('active');
  }
}

function closeModal() {
  modalOverlay.classList.remove('active');
  editingId = null; currentImage = null;
}

/* URL 입력 시 미리보기 */
formImageUrl.addEventListener('input', () => {
  const url = formImageUrl.value.trim();
  if (url) {
    imgPreview.src = url;
    imgPreview.classList.add('visible');
    currentImage = url;
  } else {
    imgPreview.classList.remove('visible');
    currentImage = null;
  }
});

document.getElementById('btn-save').addEventListener('click', () => {
  const title = formTitle.value.trim();
  const desc  = formDesc.value.trim();
  const image = formImageUrl.value.trim();

  if (!title) { alert('제목을 입력해 주세요.'); formTitle.focus(); return; }

  getPosts().then(posts => {
    let postToSave;
    if (editingId) {
      const existing = posts.find(p => p.id === editingId);
      if (!existing) return;
      postToSave = { ...existing, title, description: desc, image: image || existing.image };
    } else {
      postToSave = { id: generateId(), title, description: desc, image: image || '' };
    }
    savePost(postToSave).then(() => { renderPosts(); closeModal(); });
  });
});

document.getElementById('btn-cancel').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.getElementById('btn-add').addEventListener('click', () => openModal());


/* ═══════════════════════════════════════════════
   코드 불러오기 (Import)
   ═══════════════════════════════════════════════ */
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parser = new DOMParser();
      const doc    = parser.parseFromString(e.target.result, 'text/html');
      const cards  = doc.querySelectorAll('.post-card');

      if (cards.length === 0) {
        alert('불러올 작업물을 찾지 못했습니다.\n코드 출력으로 생성된 works_export.html 파일을 선택해 주세요.');
        return;
      }

      const imported = [];
      cards.forEach(card => {
        const titleEl = card.querySelector('.post-title');
        const descEl  = card.querySelector('.post-desc');
        const imgEl   = card.querySelector('img');
        imported.push({
          id:          generateId(),
          title:       titleEl ? unesc(titleEl.textContent.trim()) : '',
          description: descEl  ? unesc(descEl.textContent.trim())  : '',
          image:       imgEl   ? imgEl.getAttribute('src') || ''   : '',
        });
      });

      getPosts().then(existing => {
        let mode = 'replace';
        if (existing.length > 0) {
          const choice = confirm(
            `현재 작업물 ${existing.length}개가 있습니다.\n\n` +
            `[확인] 기존 데이터를 유지하고 가져온 항목 추가\n` +
            `[취소] 기존 데이터를 모두 지우고 가져온 항목으로 교체`
          );
          mode = choice ? 'merge' : 'replace';
        }

        const finalList = mode === 'merge' ? [...existing, ...imported] : imported;
        const saveAll   = () => Promise.all(finalList.map(savePost));

        if (mode === 'replace') {
          clearDB().then(saveAll).then(() => { renderPosts(); alert(`작업물 ${imported.length}개를 불러왔습니다.`); });
        } else {
          saveAll().then(() => { renderPosts(); alert(`작업물 ${imported.length}개를 불러왔습니다.`); });
        }
      });
    } catch (err) {
      console.error('Import 오류:', err);
      alert('파일을 읽는 중 오류가 발생했습니다.');
    }
  };
  reader.readAsText(file);
  this.value = '';
});


/* ═══════════════════════════════════════════════
   코드 출력 (Export)
   ═══════════════════════════════════════════════ */
document.getElementById('btn-export').addEventListener('click', exportCode);

async function exportCode() {
  const posts = await getPosts();
  posts.sort((a, b) => (a.id < b.id ? -1 : 1));

  let styleCSS = '', worksCSS = '';
  try {
    [styleCSS, worksCSS] = await Promise.all([
      fetch('css/style.css').then(r => r.text()),
      fetch('css/works.css').then(r => r.text()),
    ]);
  } catch(e) { console.warn('CSS 로드 실패', e); }

  const postsHTML = posts.length
    ? posts.map((post, idx) => `
      <article class="post-card">
        <div class="post-image-wrap">
          ${post.image
            ? `<img src="${esc(post.image)}" alt="${esc(post.title)}">`
            : `<div style="width:100%;height:100%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;color:#333;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;">No Image</div>`}
        </div>
        <div class="post-info">
          <span class="post-number">0${idx + 1}</span>
          <h2 class="post-title">${esc(post.title)}</h2>
          <p class="post-desc">${esc(post.description)}</p>
        </div>
      </article>`).join('\n')
    : `<div class="works-empty">Works</div>`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Works</title>
  <link rel="preconnect" href="[fonts.googleapis.com](https://fonts.googleapis.com)">
  <link href="[fonts.googleapis.com](https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=Noto+Serif+KR:wght@300;400;600&family=Noto+Sans+KR:wght@300;400&display=swap)" rel="stylesheet">
  <style>
${styleCSS}
${worksCSS}
.btn-add, .btn-export, .btn-import, .post-actions { display: none !important; }
  </style>
</head>
<body class="works-body">
  <header class="admin-toolbar">
    <div class="admin-toolbar-left">
      <a href="main.html" class="nav-btn">← Back</a>
      <span class="page-title-works">Works</span>
    </div>
  </header>
  <main class="works-list">${postsHTML}</main>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'works_export.html' });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', renderPosts);
