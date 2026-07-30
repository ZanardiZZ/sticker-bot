(() => {
  const key = 'sticker-analytics-preference';
  // Só configurar esta origem quando o serviço e o DNS estiverem publicados.
  // Sem origem configurada, métricas opcionais permanecem desligadas sem gerar erro de rede.
  const src = window.STICKER_ANALYTICS_ORIGIN || '';
  const site = '1ae7469e-7785-4f09-9956-8afdd8efa316';
  const get = () => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const set = (value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const load = () => {
    if (!src || document.querySelector('[data-privacy-analytics=umami]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = src;
    script.dataset.websiteId = site;
    script.dataset.privacyAnalytics = 'umami';
    document.head.appendChild(script);
  };
  const banner = () => {
    let bannerElement = document.getElementById('privacyBanner');
    if (!bannerElement) {
      bannerElement = document.createElement('section');
      bannerElement.id = 'privacyBanner';
      bannerElement.className = 'privacy-banner';
      bannerElement.innerHTML = src
        ? '<div><strong>Privacidade e métricas</strong><p>Usamos métricas anônimas opcionais para entender o uso do site. Elas ficam desativadas até você permitir.</p></div><div class="privacy-banner-actions"><button type="button" data-privacy-deny>Não permitir</button><button type="button" class="btn-primary" data-privacy-allow>Permitir métricas anônimas</button></div>'
        : '<div><strong>Privacidade</strong><p>As métricas anônimas estão temporariamente indisponíveis nesta publicação.</p></div><div class="privacy-banner-actions"><button type="button" class="btn-primary" data-privacy-deny>Fechar</button></div>';
      document.body.appendChild(bannerElement);
      bannerElement.querySelector('[data-privacy-deny]').onclick = () => { set('off'); bannerElement.remove(); };
      bannerElement.querySelector('[data-privacy-allow]')?.addEventListener('click', () => { set('on'); load(); bannerElement.remove(); });
    }
    bannerElement.hidden = false;
  };
  window.StickerPrivacy = { getPreference: get, setPreference: set, loadUmami: load, showBanner: banner };
  document.addEventListener('DOMContentLoaded', () => {
    const tools = document.createElement('div');
    tools.className = 'privacy-tools';
    tools.innerHTML = '<a href="/privacidade">Privacidade</a><button type="button">Preferências</button>';
    document.body.appendChild(tools);
    tools.querySelector('button').onclick = banner;
    if (src && get() === 'on') load();
    else if (!get()) banner();
  });
})();
