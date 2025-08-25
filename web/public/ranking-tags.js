(function () {
  function $(sel) { return document.querySelector(sel); }
  function resolveRowsPayload(d) {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.rows)) return d.rows;
    if (d && Array.isArray(d.data)) return d.data;
    return [];
  }
  async function fetchJSON(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j?.error) msg += ' - ' + j.error; if (j?.message) msg += ' - ' + j.message; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  function ensureMsgBox(parent) {
    let box = $('#tags_msg');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tags_msg';
      box.style.margin = '8px 0';
      box.style.color = '#bbb';
      parent.prepend(box);
    }
    return box;
  }

  function ensureTagsTable() {
    // Tenta achar contêiner existente
    let tbody =
      $('#tblTags tbody') ||
      $('#tags tbody') ||
      document.querySelector('table#tblTags tbody') ||
      document.querySelector('table#tags tbody');

    if (tbody) return { tbody, isTable: true, parent: tbody.closest('table').parentElement };

    // Se tiver uma lista/contêiner simples, usa-o
    let list =
      $('#tags-list') || $('#tags') || $('#list');
    if (list) return { tbody: list, isTable: false, parent: list.parentElement };

    // Cria tabela padrão
    const parent = $('#content') || $('main') || $('.container') || $('.dash') || document.body;
    const wrap = document.createElement('div');
    wrap.id = 'tags_auto_container';
    const table = document.createElement('table');
    table.id = 'tblTags';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th style="text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--border);">#</th><th style="text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--border);">Tag</th><th style="text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--border);">Qtd</th></tr>';
    const tb = document.createElement('tbody');
    table.appendChild(thead);
    table.appendChild(tb);
    wrap.appendChild(table);
    parent.appendChild(wrap);
    console.log('[rank/tags] tabela criada automaticamente.');
    return { tbody: tb, isTable: true, parent: wrap };
  }

  function showMessage(parent, text, isError) {
    const box = ensureMsgBox(parent);
    box.textContent = text || '';
    box.style.color = isError ? '#f88' : '#bbb';
  }

  async function load() {
    const { tbody, isTable, parent } = ensureTagsTable();
    try {
      const params = new URLSearchParams(location.search);
      const metric = (params.get('metric') || 'media'); // 'media' ou 'usage'
      const nsfw = (params.get('nsfw') || 'all');
      const limit = Number(params.get('limit') || 50);
      const url = `/api/rank/tags?metric=${encodeURIComponent(metric)}&nsfw=${encodeURIComponent(nsfw)}&limit=${limit}`;

      const data = await fetchJSON(url);
      console.log('[rank/tags] payload:', data);
      const rows = resolveRowsPayload(data);

      if (!rows.length) {
        if (isTable) tbody.innerHTML = '';
        showMessage(parent, 'Nenhuma tag encontrada para os filtros atuais.');
        return;
      }

      if (isTable) {
        const html = rows.map((r, i) => {
          const name = r.name || r.tag || r.id || '(sem nome)';
          const count = r.count ?? r.total ?? r.value ?? 0;
          return `<tr><td style="padding:.4rem .5rem;border-bottom:1px solid var(--border);">${i + 1}</td><td style="padding:.4rem .5rem;border-bottom:1px solid var(--border);">${name}</td><td style="padding:.4rem .5rem;border-bottom:1px solid var(--border);">${count}</td></tr>`;
        }).join('');
        tbody.innerHTML = html;
      } else {
        tbody.innerHTML = rows.map((r, i) => {
          const name = r.name || r.tag || r.id || '(sem nome)';
          const count = r.count ?? r.total ?? r.value ?? 0;
          return `<div class="row"><span>${i + 1}.</span> <strong>${name}</strong> <span>${count}</span></div>`;
        }).join('');
      }
      showMessage(parent, '');
    } catch (e) {
      console.error('[rank/tags] erro:', e);
      showMessage(parent, 'Erro ao carregar ranking de tags: ' + e.message, true);
    }
  }
  document.addEventListener('DOMContentLoaded', load);
})();