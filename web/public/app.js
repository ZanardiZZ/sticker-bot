let CURRENT_USER = null;
let BOT_CONFIG = null;

async function fetchBotConfig() {
  try {
    const r = await fetch('/api/bot-config');
    const data = await r.json();
    BOT_CONFIG = data;
  } catch (e) {
    console.warn('Could not fetch bot config:', e);
    // Set default config if API fails
    BOT_CONFIG = { whatsappNumber: '5511999999999' };
  }
}

function openWhatsApp(stickerId) {
  if (!BOT_CONFIG || !BOT_CONFIG.whatsappNumber) {
    alert('Configuração do bot não disponível');
    return;
  }
  
  const message = encodeURIComponent(`#ID ${stickerId}`);
  const whatsappUrl = `https://wa.me/${BOT_CONFIG.whatsappNumber}?text=${message}`;
  window.open(whatsappUrl, '_blank');
}


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
      <div class="card-actions">
        <button class="whatsapp-btn" data-sticker-id="${s.id}" title="Enviar no WhatsApp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.89 3.487"/>
          </svg>
          WhatsApp
        </button>
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
fetchBotConfig();

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
  // WhatsApp button
  if (e.target.closest('.whatsapp-btn')) {
    const btn = e.target.closest('.whatsapp-btn');
    const stickerId = btn.dataset.stickerId;
    openWhatsApp(stickerId);
  }
});
load(true);