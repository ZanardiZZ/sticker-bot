let CURRENT_USER = null;


function cardHTML(s) {
  const descMaxLen = 120;
  const maxTags = 3;

  let desc = s.description || '';
  const longDesc = desc.length > descMaxLen;
  let descShort = desc;
  if (longDesc) descShort = desc.slice(0, descMaxLen - 1) + '…';

  const tags = s.tags || [];
  let tagsShortHtml = tags.slice(0, maxTags).map(t => `<span class="tag">#${t}</span>`).join(' ');
  if (tags.length > maxTags) {
    tagsShortHtml += ` <span class="tag tag-more">+${tags.length - maxTags}</span>`;
  }
  let tagsFullHtml = tags.map(t => `<span class="tag">#${t}</span>`).join(' ');

  const mime = s.mimetype || '';
  const url = s.url || '';
  const isVideo = mime === 'video/mp4' || url.endsWith('.mp4');

  // card-expand-btn e card-collapse-btn são os botões de expandir/recolher
  return `
    <div class="card" data-id="${s.id}">
      ${isVideo
        ? `<video src="${url}" class="card-video" style="max-width:128px;max-height:128px;display:block;margin:auto;" autoplay loop muted playsinline></video>`
        : `<img src="${url}" alt="sticker" class="card-img" style="max-width:128px;max-height:128px;display:block;margin:auto;">`
      }
      <div class="desc clamp-2" data-desc-full="${desc.replace(/"/g, '&quot;')}">${descShort}
        ${longDesc ? `<button class="card-expand-btn">ver mais</button>` : ''}
      </div>
      <div class="desc-full" style="display:none;">${desc}
        <button class="card-collapse-btn">ver menos</button>
      </div>
      <div class="tags tags-short">${tagsShortHtml}
        ${tags.length > maxTags ? `<button class="card-expand-tags-btn">ver todas</button>` : ''}
      </div>
      <div class="tags tags-full" style="display:none;">${tagsFullHtml}
        <button class="card-collapse-tags-btn">ver menos</button>
      </div>
    </div>
  `;
}

async function fetchMe(){
  try {
    const r = await fetch('/api/me');
    const d = await r.json();
    CURRENT_USER = d.user;
    const ui = document.getElementById('userInfo');
    if (CURRENT_USER) {
      ui.innerHTML = 'Logado como ' + CURRENT_USER.username + ' <button id="logoutBtn" style="font-size:.65rem;">Logout</button>';
      document.getElementById('logoutBtn').onclick = async () => { await fetch('/api/logout',{method:'POST'}); location.reload(); };
    } else {
      ui.innerHTML = '<a href="/login">Login</a>';
    }
  } catch {}
}
fetchMe();

const grid = document.getElementById('grid');
const countEl = document.getElementById('count');
const qEl = document.getElementById('q');
const tagEl = document.getElementById('tag');
const anyTagEl = document.getElementById('anyTag');
const nsfwEl = document.getElementById('nsfw');
const sortEl = document.getElementById('sort');
const reloadBtn = document.getElementById('reload');
let page = 1, loading = false, done = false, perPage = 60;

async function load(reset = false){
  if (loading) return;
  if (reset) { page = 1; done = false; grid.innerHTML = ''; }
  if (done) return;
  loading = true;

  const tags = tagEl.value.trim();
  const anyTag = anyTagEl.value.trim();
  const params = new URLSearchParams({ page, per_page: perPage, q: qEl.value.trim(), sort: sortEl.value, nsfw: nsfwEl.value });
  if (tags) params.set('tags', tags.split(/[,\s]+/).join(','));
  if (anyTag) params.set('any_tag', anyTag.split(/[,\s]+/).join(','));

  const r = await fetch('/api/stickers?' + params.toString());
  const data = await r.json();
  countEl.textContent = (data.total ?? 0) + ' itens';
  if (!data.results || data.results.length === 0) {
    done = true;
  } else {
    data.results.forEach(s => grid.insertAdjacentHTML('beforeend', cardHTML(s)));
    if (data.results.length < perPage) done = true;
    page++;
  }
  loading = false;
}

[qEl, tagEl, anyTagEl, nsfwEl, sortEl].forEach(el => {
  el.addEventListener('change', () => load(true));
  el.addEventListener('input', () => {
    if (el === qEl) {
      clearTimeout(window.__qTimer);
      window.__qTimer = setTimeout(() => load(true), 400);
    }
  });
});
reloadBtn.addEventListener('click', () => load(true));

// Infinite scroll
const sentinel = document.createElement('div'); sentinel.style.height = '1px'; document.body.appendChild(sentinel);
new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) load(); }).observe(sentinel);

// SSE
try{
  const es = new EventSource('/api/stream');
  const bump = () => { if (page <= 2) load(true); };
  es.addEventListener('media:new', bump);
  es.addEventListener('media:updated', bump);
  es.addEventListener('media:tags', bump);
}catch(e){}

// Modal de edição
const modal = document.getElementById('editModal');
const editIdEl = document.getElementById('editId');
const editDesc = document.getElementById('editDesc');
const editNsfw = document.getElementById('editNsfw');
const editTags = document.getElementById('editTags');
const editMsg = document.getElementById('editMsg');

document.getElementById('cancelEdit').onclick = () => { modal.style.display = 'none'; };
modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('editBtn')) {
    const card = e.target.closest('.card');
    openEdit(card.dataset.id);
  }
});

async function openEdit(id){
  const r = await fetch('/api/stickers/' + id);
  if (!r.ok) return;
  const data = await r.json();
  editIdEl.textContent = id;
  editDesc.value = data.description || '';
  editNsfw.checked = !!data.nsfw;
  editTags.value = (data.tags || []).join(', ');
  editMsg.textContent = '';
  modal.style.display = 'flex';
}

document.getElementById('saveEdit').onclick = async () => {
  const id = editIdEl.textContent;
  editMsg.textContent = 'Salvando...';
  const metaBody = { description: editDesc.value, nsfw: editNsfw.checked ? 1 : 0 };
  const r1 = await fetch('/api/stickers/' + id, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(metaBody) });
  const tags = editTags.value.split(',').map(t => t.trim()).filter(Boolean);
  const r2 = await fetch('/api/stickers/' + id + '/tags', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ tags }) });
  if (r1.ok && r2.ok) {
    editMsg.textContent = 'Atualizado!';
    setTimeout(() => { modal.style.display = 'none'; load(true); }, 600);
  } else {
    editMsg.textContent = 'Erro ao salvar.';
  }
};


// Adicione no final do seu JS (após montar os cards)
document.addEventListener('click', function(e) {
  // Expandir descrição
  if (e.target.classList.contains('card-expand-btn')) {
    const card = e.target.closest('.card');
    card.querySelector('.desc').style.display = 'none';
    card.querySelector('.desc-full').style.display = '';
  }
  // Recolher descrição
  if (e.target.classList.contains('card-collapse-btn')) {
    const card = e.target.closest('.card');
    card.querySelector('.desc').style.display = '';
    card.querySelector('.desc-full').style.display = 'none';
  }
  // Expandir tags
  if (e.target.classList.contains('card-expand-tags-btn')) {
    const card = e.target.closest('.card');
    card.querySelector('.tags-short').style.display = 'none';
    card.querySelector('.tags-full').style.display = '';
  }
  // Recolher tags
  if (e.target.classList.contains('card-collapse-tags-btn')) {
    const card = e.target.closest('.card');
    card.querySelector('.tags-short').style.display = '';
    card.querySelector('.tags-full').style.display = 'none';
  }
});
load(true);