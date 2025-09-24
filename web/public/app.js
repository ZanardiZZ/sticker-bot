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
  let tagsShortHtml = tags.slice(0, maxTags).map(t => `<span class="tag">${t.startsWith('#') ? t : '#' + t}</span>`).join(' ');
  if (tags.length > maxTags) {
    tagsShortHtml += ` <span class="tag tag-more">+${tags.length - maxTags}</span>`;
  }
  let tagsFullHtml = tags.map(t => `<span class="tag">${t.startsWith('#') ? t : '#' + t}</span>`).join(' ');

  const mime = s.mimetype || '';
  const url = s.url || '';
  const isVideo = mime === 'video/mp4' || url.endsWith('.mp4');

  // card-expand-btn e card-collapse-btn são os botões de expandir/recolher
  return `
    <div class="card" data-id="${s.id}">
      ${isVideo
        ? `<video data-src="${url}" class="card-video lazy-video" style="max-width:128px;max-height:128px;display:block;margin:auto;" muted playsinline preload="none"></video>`
        : `<img data-src="${url}" alt="sticker" class="card-img lazy-img" style="max-width:128px;max-height:128px;display:block;margin:auto;">`
      }
      <div class="sticker-id">#${s.id}</div>
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
        ${CURRENT_USER ? `<button class="editBtn" title="Editar sticker">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
          Editar
        </button>` : ''}
        ${CURRENT_USER && CURRENT_USER.role === 'admin' ? `<button class="deleteBtn" title="Deletar sticker" style="background-color: #dc3545; border-color: #dc3545;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
          Deletar
        </button>` : ''}
      </div>
    </div>
  `;
}

async function fetchMe(){
  const prevUser = CURRENT_USER;
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
    
    // Refresh cards if login status changed
    if ((!!prevUser) !== (!!CURRENT_USER)) {
      load(true);
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
let page = 1, loading = false, done = false, perPage = 20; // Reduced from 30 to 20 for faster loading

// Lazy loading implementation
function initializeLazyLoading() {
  const lazyImages = document.querySelectorAll('.lazy-img:not([src])');
  const lazyVideos = document.querySelectorAll('.lazy-video:not([src])');
  
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy-img');
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '50px' });
  
  const videoObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const video = entry.target;
        video.src = video.dataset.src;
        video.autoplay = true;
        video.loop = true;
        video.classList.remove('lazy-video');
        observer.unobserve(video);
      }
    });
  }, { rootMargin: '100px' });
  
  lazyImages.forEach(img => imageObserver.observe(img));
  lazyVideos.forEach(video => videoObserver.observe(video));
}

async function load(reset = false){
  if (loading) return;
  if (reset) { page = 1; done = false; grid.innerHTML = ''; }
  if (done) return;
  loading = true;

  try {
    const tags = tagEl.value.trim();
    const anyTag = anyTagEl.value.trim();
    const params = new URLSearchParams({ 
      page, 
      per_page: perPage, 
      q: qEl.value.trim(), 
      sort: sortEl.value, 
      nsfw: nsfwEl.value 
    });
    
    if (tags) params.set('tags', tags.split(/[,\s]+/).join(','));
    if (anyTag) params.set('any_tag', anyTag.split(/[,\s]+/).join(','));

    const r = await fetch('/api/stickers?' + params.toString());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    
    const data = await r.json();
    
    countEl.textContent = (data.total ?? 0) + ' itens';
    
    if (!data.results || data.results.length === 0) {
      done = true;
      if (page === 1) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">Nenhum resultado encontrado</div>';
      }
    } else {
      data.results.forEach(s => {
        grid.insertAdjacentHTML('beforeend', cardHTML(s));
      });
      
      // Initialize lazy loading for new content
      initializeLazyLoading();
      
      if (data.results.length < perPage) done = true;
      page++;
    }
  } catch (error) {
    console.error('Erro ao carregar stickers:', error);
    if (page === 1) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #dc3545;">Erro ao carregar. Tente recarregar a página.</div>';
    }
  } finally {
    loading = false;
  }
}

// Function to refresh current view without resetting to page 1
function refreshCurrentView() {
  // Find the updated sticker in current view and update it
  const currentCards = grid.querySelectorAll('.card');
  if (currentCards.length > 0) {
    // For now, just reload the first page to ensure consistency
    // In a more complex implementation, we could update individual cards
    load(true);
  }
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

async function openStickerDetails(id){
  const r = await fetch('/api/stickers/' + id);
  if (!r.ok) return;
  const data = await r.json();
  
  // Show appropriate modal based on user login status
  if (CURRENT_USER) {
    // For logged users, show edit modal
    openEdit(id);
  } else {
    // For non-logged users, show read-only details modal
    showReadOnlyDetails(data);
  }
}

function showReadOnlyDetails(data) {
  editIdEl.textContent = data.id;
  
  // Display additional information
  const detailsEl = document.getElementById('stickerDetails');
  const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString('pt-BR') : 'N/A';
  const senderInfo = data.sender_id ? `Usuário: ${data.sender_id}` : 'Usuário: N/A';
  const hashVisual = data.hash_visual ? `Hash Visual: ${data.hash_visual.slice(0, 12)}...` : '';
  const hashMd5 = data.hash_md5 ? `MD5: ${data.hash_md5.slice(0, 12)}...` : '';
  const nsfwStatus = data.nsfw ? 'NSFW: Sim' : 'NSFW: Não';
  const randomCount = data.count_random || 0;
  const tags = data.tags || [];
  
  detailsEl.innerHTML = `
    <strong>Detalhes do Sticker #${data.id}:</strong><br>
    ${senderInfo} • ${timestamp}<br>
    ${nsfwStatus} • Enviado ${randomCount} vezes<br>
    ${hashVisual ? hashVisual + '<br>' : ''}
    ${hashMd5 ? hashMd5 : ''}<br><br>
    <strong>Descrição completa:</strong><br>
    <div style="background:#fff; padding:8px; border-radius:4px; margin:4px 0; border: 1px solid #ddd;">
      ${data.description || 'Sem descrição'}
    </div><br>
    <strong>Tags:</strong><br>
    <div style="margin-top:4px;">
      ${tags.length > 0 ? tags.map(t => `<span class="tag">${t.startsWith('#') ? t : '#' + t}</span>`).join(' ') : '<em>Nenhuma tag</em>'}
    </div>
  `;
  
  // Hide edit form elements and show read-only view
  editDesc.style.display = 'none';
  editNsfw.parentElement.style.display = 'none';
  editTags.style.display = 'none';
  document.getElementById('saveEdit').style.display = 'none';
  document.getElementById('cancelEdit').textContent = 'Fechar';
  editMsg.textContent = '';
  
  modal.style.display = 'flex';
}

async function openEdit(id){
  const r = await fetch('/api/stickers/' + id);
  if (!r.ok) return;
  const data = await r.json();
  editIdEl.textContent = id;
  editDesc.value = data.description || '';
  editNsfw.checked = !!data.nsfw;
  editTags.value = (data.tags || []).join(', ');
  editMsg.textContent = '';
  
  // Show edit form elements for logged users
  editDesc.style.display = '';
  editNsfw.parentElement.style.display = '';
  editTags.style.display = '';
  document.getElementById('saveEdit').style.display = '';
  document.getElementById('cancelEdit').textContent = 'Cancelar';
  
  // Display additional information
  const detailsEl = document.getElementById('stickerDetails');
  const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString('pt-BR') : 'N/A';
  const senderInfo = data.sender_id ? `Usuário: ${data.sender_id}` : 'Usuário: N/A';
  const hashVisual = data.hash_visual ? `Hash Visual: ${data.hash_visual.slice(0, 12)}...` : '';
  const hashMd5 = data.hash_md5 ? `MD5: ${data.hash_md5.slice(0, 12)}...` : '';
  const nsfwStatus = data.nsfw ? 'NSFW: Sim' : 'NSFW: Não';
  const randomCount = data.count_random || 0;
  
  detailsEl.innerHTML = `
    <strong>Detalhes do Sticker:</strong><br>
    ${senderInfo} • ${timestamp}<br>
    ${nsfwStatus} • Enviado ${randomCount} vezes<br>
    ${hashVisual ? hashVisual + '<br>' : ''}
    ${hashMd5 ? hashMd5 : ''}
  `;
  
  modal.style.display = 'flex';
}

document.getElementById('saveEdit').onclick = async () => {
  const id = editIdEl.textContent;
  const saveBtn = document.getElementById('saveEdit');
  const originalText = saveBtn.textContent;
  
  // Show loading state
  saveBtn.textContent = 'Salvando...';
  saveBtn.disabled = true;
  saveBtn.classList.add('btn-loading');
  editMsg.textContent = 'Salvando alterações...';
  editMsg.style.color = '#007bff';
  
  try {
    // Prepare both requests
    const metaBody = { description: editDesc.value, nsfw: editNsfw.checked ? 1 : 0 };
    const tags = editTags.value.split(',').map(t => t.trim()).filter(Boolean);
    
    // Execute both requests in parallel for better performance
    const [r1, r2] = await Promise.all([
      fetch('/api/stickers/' + id, { 
        method:'PATCH', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify(metaBody) 
      }),
      fetch('/api/stickers/' + id + '/tags', { 
        method:'PUT', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({ tags }) 
      })
    ]);
    
    if (r1.ok && r2.ok) {
      editMsg.textContent = 'Atualizado com sucesso!';
      editMsg.style.color = '#28a745';
      setTimeout(() => { 
        modal.style.display = 'none'; 
        // Only reload the current view instead of forcing page 1
        refreshCurrentView();
      }, 800);
    } else {
      throw new Error('Erro ao salvar');
    }
  } catch (error) {
    editMsg.textContent = 'Erro ao salvar. Tente novamente.';
    editMsg.style.color = '#dc3545';
  } finally {
    // Restore button state
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
    saveBtn.classList.remove('btn-loading');
  }
};

async function deleteSticker(id) {
  // Confirm deletion
  const confirmMsg = `Tem certeza que deseja deletar o sticker #${id}?\n\nEsta ação é irreversível e irá remover tanto o registro do banco de dados quanto o arquivo correspondente.`;
  
  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    const response = await fetchWithCSRF(`/api/stickers/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      const result = await response.json();
      alert(`Sticker #${id} deletado com sucesso!`);
      // Remove the card from the current view
      const card = document.querySelector(`[data-id="${id}"]`);
      if (card) {
        card.remove();
      }
      // Update the count if visible
      const countEl = document.getElementById('count');
      if (countEl && countEl.textContent) {
        const currentText = countEl.textContent;
        const match = currentText.match(/(\d+)/);
        if (match) {
          const currentCount = parseInt(match[1]);
          const newCount = Math.max(0, currentCount - 1);
          countEl.textContent = currentText.replace(/\d+/, newCount.toString());
        }
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error === 'forbidden' 
        ? 'Você não tem permissão para deletar stickers.'
        : 'Erro ao deletar sticker. Tente novamente.';
      alert(errorMsg);
    }
  } catch (error) {
    console.error('Error deleting sticker:', error);
    alert('Erro ao deletar sticker. Verifique sua conexão e tente novamente.');
  }
}


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
  // Edit button for logged users
  if (e.target.classList.contains('editBtn') || e.target.closest('.editBtn')) {
    const card = e.target.closest('.card');
    openEdit(card.dataset.id);
  }
  // Delete button for admin users
  if (e.target.classList.contains('deleteBtn') || e.target.closest('.deleteBtn')) {
    const card = e.target.closest('.card');
    deleteSticker(card.dataset.id);
  }
  // Click on card to view details (for all users)
  if (e.target.closest('.card') && !e.target.closest('.card-expand-btn') && !e.target.closest('.card-collapse-btn') && 
      !e.target.closest('.card-expand-tags-btn') && !e.target.closest('.card-collapse-tags-btn') &&
      !e.target.closest('.whatsapp-btn') && !e.target.closest('.editBtn') && !e.target.closest('.deleteBtn')) {
    const card = e.target.closest('.card');
    openStickerDetails(card.dataset.id);
  }
});
load(true);