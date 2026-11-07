/* =====================================================================
   FielTour — Próximos Destinos (página pública, sem login)
   Lê a view public.pacotes_publicos, que já entrega SOMENTE pacotes
   ativos e o preço como NULL quando mostrar_preco = FALSE. Ou seja: o
   preço oculto nem chega ao navegador do visitante.
   ===================================================================== */
(function () {
  'use strict';

  var grid = document.getElementById('dest-grid');
  if (!grid) return;
  var empty = document.getElementById('dest-empty');
  var FT = window.FielTour;
  var U = FT && FT.util;
  var WHATS = '5591982029843';
  var REFRESH_MS = 60000;
  var lastSignature = '';
  var byId = {};

  var FALLBACK_IMG = 'https://commons.wikimedia.org/wiki/Special:FilePath/Ilha_do_Amor,_%C3%81lter_do_Ch%C3%A3o.JPG?width=800';

  function whatsLink(titulo) {
    return 'https://wa.me/' + WHATS + '?text=' + encodeURIComponent('Olá! Quero conhecer o roteiro ' + titulo + ' pela FielTour!');
  }

  function vagasBadge(v) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    if (!isFinite(n)) return '';
    if (n <= 0) return 'ESGOTADO';
    if (n <= 5) return n === 1 ? 'ÚLTIMA VAGA' : 'ÚLTIMAS ' + n + ' VAGAS';
    return n + ' VAGAS';
  }

  function skeleton() {
    var card = '<div class="bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-slate-100 overflow-hidden animate-pulse">' +
      '<div class="h-32 sm:h-56 bg-slate-200"></div><div class="p-3 sm:p-6 space-y-3">' +
      '<div class="h-3 bg-slate-200 rounded w-1/3"></div><div class="h-5 bg-slate-200 rounded w-2/3"></div>' +
      '<div class="h-3 bg-slate-200 rounded w-1/2"></div><div class="h-9 bg-slate-100 rounded-full mt-6"></div></div></div>';
    grid.innerHTML = card + card + card;
  }

  function cardHTML(p) {
    var esc = U.esc;
    var img = U.safeImg(p.imagem_url) || FALLBACK_IMG;
    var badge = vagasBadge(p.vagas_disponiveis);
    var datas = U.fmtRange(p.data_partida, p.data_retorno);
    var preco = U.fmtPrice(p.preco); // NULL quando o admin ocultou o preço
    return '' +
      '<article class="dest-card bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-slate-100 overflow-hidden flex flex-col card-hover" data-id="' + esc(p.id) + '">' +
        '<div class="relative h-32 sm:h-56 overflow-hidden">' +
          '<img src="' + esc(img) + '" alt="' + esc(p.titulo + ' — ' + p.destino) + '" loading="lazy" class="w-full h-full object-cover">' +
          (badge ? '<span class="absolute top-2 left-2 sm:top-4 sm:left-4 bg-fiel-dark/85 backdrop-blur text-white text-[8px] sm:text-xs font-bold uppercase tracking-wide sm:tracking-wider px-2 py-1 sm:px-4 sm:py-2 rounded-full">' + esc(badge) + '</span>' : '') +
        '</div>' +
        '<div class="p-3 sm:p-6 flex flex-col flex-1">' +
          (datas ? '<div class="flex items-center gap-1.5 sm:gap-3 text-fiel-cyan font-bold text-[11px] sm:text-base"><i class="fa-solid fa-calendar-days"></i><span class="dest-date">' + esc(datas) + '</span></div>' : '') +
          '<h3 class="font-display font-black text-sm sm:text-2xl text-fiel-dark mt-1.5 sm:mt-2 leading-snug">' + esc(p.titulo) + '</h3>' +
          '<div class="flex items-start gap-1.5 sm:gap-2 text-slate-500 text-[11px] sm:text-sm mt-1.5 sm:mt-2"><i class="fa-solid fa-location-dot text-fiel-cyan"></i><span>' + esc(p.destino) + '</span></div>' +
          (p.descricao ? '<p class="dest-desc text-slate-600 text-[11px] sm:text-base mt-2 sm:mt-3 line-clamp-2">' + esc(p.descricao) + '</p>' : '') +
          (preco ? '<div class="mt-2 sm:mt-4"><span class="block text-[10px] sm:text-xs text-slate-400 font-semibold uppercase tracking-wide">A partir de</span><span class="font-display font-black text-base sm:text-2xl text-fiel-dark">' + esc(preco) + '</span></div>' : '') +
          '<div class="mt-auto pt-3 sm:pt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">' +
            '<a href="' + esc(whatsLink(p.titulo)) + '" target="_blank" rel="noopener noreferrer" class="flex-1 bg-fiel-cyan hover:bg-fiel-blue text-white font-display font-bold text-[11px] sm:text-base py-2.5 sm:py-3.5 rounded-full shadow-md transition-colors flex items-center justify-center gap-2"><span>VER ROTEIRO</span><i class="fa-brands fa-whatsapp text-lg"></i></a>' +
            '<button type="button" class="dest-more bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] sm:text-sm px-4 py-2 sm:px-5 sm:py-3.5 rounded-full transition-colors" data-id="' + esc(p.id) + '">Detalhes</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render(list) {
    byId = {};
    list.forEach(function (p) { byId[String(p.id)] = p; });
    grid.innerHTML = list.map(cardHTML).join('');
    grid.setAttribute('aria-busy', 'false');
    if (empty) empty.classList.toggle('hidden', list.length > 0);
  }

  function showMessage(msg) {
    grid.innerHTML = '';
    grid.setAttribute('aria-busy', 'false');
    if (empty) { empty.textContent = msg; empty.classList.remove('hidden'); }
  }

  async function load(first) {
    if (!FT || !FT.client) {
      if (first) {
        console.warn('[FielTour] ' + (FT ? FT.NOT_CONFIGURED_MSG : 'supabase-client.js não carregou.'));
        showMessage('Novos roteiros em breve. Fale com um consultor!');
      }
      return;
    }
    if (first) skeleton();
    var r = await FT.client
      .from('pacotes_publicos')
      .select('id, titulo, descricao, destino, preco, mostrar_preco, data_partida, data_retorno, vagas_disponiveis, imagem_url, data_criacao')
      .order('data_partida', { ascending: true, nullsFirst: false })
      .order('data_criacao', { ascending: false });
    if (r.error) {
      console.error('[FielTour] Erro ao carregar destinos:', r.error.message);
      if (first) showMessage('Não foi possível carregar os destinos agora. Fale com a gente pelo WhatsApp!');
      return;
    }
    var sig = JSON.stringify(r.data);
    if (sig === lastSignature) return; // nada mudou
    lastSignature = sig;
    render(r.data || []);
  }

  /* ---------- Modal de detalhes (reaproveita o #package-modal existente) ---------- */
  var modal = document.getElementById('package-modal');
  function openModal(p) {
    if (!modal) return;
    var esc = U.esc;
    var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
    var img = document.getElementById('modal-img');
    if (img) { img.src = U.safeImg(p.imagem_url) || FALLBACK_IMG; img.alt = p.titulo; }
    var badge = document.getElementById('modal-badge');
    var b = vagasBadge(p.vagas_disponiveis);
    if (badge) { badge.textContent = b; badge.classList.toggle('hidden', !b); }
    set('modal-title', p.titulo);
    set('modal-date', U.fmtRange(p.data_partida, p.data_retorno) || 'Datas a confirmar');
    set('modal-location', p.destino);
    set('modal-desc', p.descricao || 'Fale com um consultor para conhecer o roteiro completo.');
    var hl = document.getElementById('modal-highlights');
    if (hl) {
      var items = [];
      if (p.data_partida) items.push(['fa-plane-departure', 'Partida: ' + U.fmtDateShort(p.data_partida)]);
      if (p.data_retorno) items.push(['fa-plane-arrival', 'Retorno: ' + U.fmtDateShort(p.data_retorno)]);
      if (p.vagas_disponiveis !== null && p.vagas_disponiveis !== undefined) {
        items.push(['fa-users', Number(p.vagas_disponiveis) > 0 ? p.vagas_disponiveis + ' vaga(s) disponível(is)' : 'Vagas esgotadas — entre na lista de espera']);
      }
      var preco = U.fmtPrice(p.preco);
      items.push(['fa-tag', preco ? 'A partir de ' + preco : 'Consulte valores e condições pelo WhatsApp']);
      hl.innerHTML = items.map(function (i) {
        return '<li class="flex items-center gap-2"><i class="fa-solid ' + i[0] + ' text-fiel-cyan w-4"></i><span>' + esc(i[1]) + '</span></li>';
      }).join('');
    }
    var link = document.getElementById('modal-whatsapp-link');
    if (link) link.href = whatsLink(p.titulo);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('.js-close-modal')) closeModal();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }
  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('.dest-more');
    if (!btn) return;
    var p = byId[btn.getAttribute('data-id')];
    if (p) openModal(p);
  });

  /* ---------- Atualização automática ---------- */
  load(true);
  setInterval(function () { if (document.visibilityState === 'visible') load(false); }, REFRESH_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(false); });
})();
