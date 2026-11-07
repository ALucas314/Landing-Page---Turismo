/* =====================================================================
   FielTour — Painel administrativo (Próximos Destinos)
   Segurança: esta página só mostra o painel depois que o SERVIDOR
   confirma que o usuário é administrador. Mesmo que alguém burle o
   JavaScript, o banco (RLS) recusa qualquer leitura/escrita em
   public.pacotes e no bucket de imagens para quem não é admin.
   ===================================================================== */
(function () {
  'use strict';

  var FT = window.FielTour;
  var $ = function (id) { return document.getElementById(id); };

  var MAX_IMG = 5 * 1024 * 1024;
  var IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
  var COLS = 'id, titulo, descricao, destino, preco, mostrar_preco, data_partida, data_retorno, vagas_disponiveis, imagem_url, ativo, data_criacao';

  var sb, U, BUCKET;
  var state = { pacotes: [], filtro: 'todos', busca: '', editing: null, file: null, filePreview: null, loading: false };

  /* =================================================================
     1. PROTEÇÃO DA ROTA
     ================================================================= */
  function guardFail(msg, showLink) {
    $('guard-icon').className = 'fa-solid fa-lock text-4xl text-fiel-cyan';
    $('guard-msg').textContent = msg;
    $('guard-link').classList.toggle('hidden', !showLink);
  }
  function goLogin(motivo) { window.location.replace('login.html' + (motivo ? '?motivo=' + motivo : '')); }

  async function boot() {
    if (!FT || !FT.client) {
      guardFail(FT ? FT.NOT_CONFIGURED_MSG : 'Arquivo assets/js/supabase-client.js não carregou.', true);
      return;
    }
    sb = FT.client; U = FT.util; BUCKET = FT.bucket;

    var r;
    try { r = await FT.checkAdmin(); }
    catch (e) { guardFail('Não foi possível verificar seu acesso. Verifique sua conexão.', true); return; }

    if (r.status === 'sem-sessao') return goLogin();
    if (r.status === 'negado') { await sb.auth.signOut(); return goLogin('negado'); }
    if (r.status !== 'ok') { await sb.auth.signOut(); return goLogin('erro'); }

    // Acesso confirmado
    var nome = (r.perfil.nome_completo || '').trim() || r.user.email;
    var primeiro = nome.split(/\s+/)[0];
    var inicial = (nome.charAt(0) || 'A').toUpperCase();
    $('admin-name').textContent = nome;
    $('admin-email').textContent = r.user.email || '';
    $('top-name').textContent = primeiro;
    $('admin-avatar').textContent = inicial;
    $('top-avatar').textContent = inicial;

    $('guard').classList.add('hidden');
    $('app').classList.remove('hidden');

    // Sessão encerrada em outra aba / token revogado
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') goLogin('saiu');
    });

    bindUI();
    loadPacotes();
  }

  /* =================================================================
     2. UTILITÁRIOS DE INTERFACE
     ================================================================= */
  function toast(type, msg) {
    var styles = {
      success: ['bg-emerald-600', 'fa-circle-check'],
      error: ['bg-red-600', 'fa-circle-exclamation'],
      info: ['bg-fiel-dark', 'fa-circle-info'],
      warn: ['bg-amber-500', 'fa-triangle-exclamation']
    }[type] || ['bg-fiel-dark', 'fa-circle-info'];
    var el = document.createElement('div');
    el.className = 'toast-enter pointer-events-auto ' + styles[0] + ' text-white rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3 text-sm font-semibold';
    el.innerHTML = '<i class="fa-solid ' + styles[1] + ' mt-0.5"></i><span class="flex-1"></span><button type="button" class="opacity-70 hover:opacity-100" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>';
    el.querySelector('span').textContent = msg;
    el.querySelector('button').onclick = function () { el.remove(); };
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, type === 'error' ? 7000 : 4000);
  }

  function errMsg(e) {
    if (!e) return 'Erro desconhecido.';
    var m = String(e.message || e.error_description || e.error || '');
    var code = String(e.code || '');
    var status = Number(e.statusCode || e.status || 0);
    if (code === 'PGRST301' || /jwt expired|invalid jwt/i.test(m)) { setTimeout(function () { goLogin('expirado'); }, 1500); return 'Sua sessão expirou. Entre novamente.'; }
    if (code === '42501' || /row-level security|permission denied|unauthorized/i.test(m) || status === 403) return 'Sem permissão para esta operação. Apenas administradores podem alterar os pacotes.';
    if (code === 'PGRST116') return 'Pacote não encontrado ou sem permissão para alterá-lo. Recarregue a lista.';
    if (code === 'P0001') return m; // validações do banco (mensagens em português)
    if (code === '23514') return 'Dados inválidos: confira preço, vagas e datas.';
    if (code === '23502') return 'Preencha os campos obrigatórios.' + (e.details ? ' (' + e.details + ')' : '');
    if (code === '22P02' || code === '22007' || code === '22008') return 'Formato inválido em algum campo (número ou data).';
    if (status === 413 || /exceeded the maximum|too large/i.test(m)) return 'A imagem ultrapassa o limite de 5 MB.';
    if (/mime type|invalid_mime/i.test(m)) return 'Formato de imagem não permitido. Use JPG, PNG, WEBP ou AVIF.';
    if (/failed to fetch|network/i.test(m)) return 'Falha de conexão. Verifique sua internet e tente novamente.';
    return m || 'Não foi possível concluir a operação.';
  }

  function setBusy(btn, busy, iconEl, textEl, busyText, idleIcon, idleText) {
    btn.disabled = busy;
    if (iconEl) iconEl.className = busy ? 'fa-solid fa-spinner fa-spin' : idleIcon;
    if (textEl) textEl.textContent = busy ? busyText : idleText;
  }

  function lockScroll(on) { document.body.style.overflow = on ? 'hidden' : ''; }

  /* =================================================================
     3. LISTAGEM
     ================================================================= */
  function skeleton() {
    var c = '<div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-pulse"><div class="h-44 bg-slate-200"></div><div class="p-5 space-y-3"><div class="h-5 bg-slate-200 rounded w-2/3"></div><div class="h-3 bg-slate-200 rounded w-1/2"></div><div class="h-3 bg-slate-200 rounded w-1/3"></div><div class="h-10 bg-slate-100 rounded-xl mt-5"></div></div></div>';
    $('pk-grid').innerHTML = c + c + c;
    $('pk-empty').classList.add('hidden');
  }

  async function loadPacotes() {
    state.loading = true;
    skeleton();
    var btn = $('btn-refresh');
    btn.querySelector('i').classList.add('fa-spin');
    var r = await sb.from('pacotes').select(COLS)
      .order('data_partida', { ascending: true, nullsFirst: false })
      .order('data_criacao', { ascending: false });
    btn.querySelector('i').classList.remove('fa-spin');
    state.loading = false;
    if (r.error) {
      $('pk-grid').innerHTML = '';
      showEmpty('Não foi possível carregar os pacotes', errMsg(r.error));
      toast('error', errMsg(r.error));
      return;
    }
    state.pacotes = r.data || [];
    render();
  }

  function showEmpty(title, text) {
    $('pk-empty-title').textContent = title;
    $('pk-empty-text').textContent = text;
    $('pk-empty').classList.remove('hidden');
  }

  function stats() {
    var p = state.pacotes;
    var ativos = p.filter(function (x) { return x.ativo; }).length;
    $('st-total').textContent = p.length;
    $('st-ativos').textContent = ativos;
    $('st-inativos').textContent = p.length - ativos;
    $('st-preco').textContent = p.filter(function (x) { return x.mostrar_preco === false; }).length;
    $('nav-count').textContent = p.length;
  }

  function filtered() {
    var q = state.busca.trim().toLowerCase();
    return state.pacotes.filter(function (p) {
      if (state.filtro === 'ativos' && !p.ativo) return false;
      if (state.filtro === 'inativos' && p.ativo) return false;
      if (q && (String(p.titulo) + ' ' + String(p.destino)).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function cardHTML(p) {
    var esc = U.esc, id = esc(p.id);
    var img = U.safeImg(p.imagem_url);
    var datas = U.fmtRange(p.data_partida, p.data_retorno);
    var preco = U.fmtPrice(p.preco);
    var showPrice = p.mostrar_preco !== false;
    var vagas = (p.vagas_disponiveis === null || p.vagas_disponiveis === undefined) ? null : Number(p.vagas_disponiveis);

    return '' +
    '<article class="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg transition-shadow overflow-hidden flex flex-col' + (p.ativo ? '' : ' opacity-90') + '" data-id="' + id + '">' +
      '<div class="relative h-44 bg-slate-100 group">' +
        (img
          ? '<img src="' + esc(img) + '" alt="' + esc(p.titulo) + '" loading="lazy" class="w-full h-full object-cover' + (p.ativo ? '' : ' grayscale-[40%]') + '">'
          : '<div class="w-full h-full flex flex-col items-center justify-center text-slate-400"><i class="fa-regular fa-image text-3xl"></i><span class="text-xs mt-1">Sem imagem</span></div>') +
        '<span class="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow ' +
          (p.ativo ? 'bg-emerald-500 text-white' : 'bg-slate-700/85 text-white') + '">' +
          '<i class="fa-solid ' + (p.ativo ? 'fa-globe' : 'fa-eye-slash') + ' mr-1"></i>' + (p.ativo ? 'Publicado' : 'Oculto') + '</span>' +
        '<button type="button" data-action="imagem" data-id="' + id + '" class="absolute top-3 right-3 bg-white/90 hover:bg-white text-fiel-dark text-xs font-bold px-3 py-1.5 rounded-full shadow transition-colors" title="Alterar imagem">' +
          '<i class="fa-solid fa-camera"></i> <span class="hidden sm:inline">Alterar imagem</span></button>' +
      '</div>' +
      '<div class="p-5 flex flex-col flex-1">' +
        '<h3 class="font-display font-black text-lg text-fiel-dark leading-snug">' + esc(p.titulo) + '</h3>' +
        '<p class="flex items-center gap-2 text-slate-500 text-sm mt-1"><i class="fa-solid fa-location-dot text-fiel-cyan"></i>' + esc(p.destino) + '</p>' +
        '<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600 mt-3">' +
          '<span><i class="fa-regular fa-calendar text-fiel-cyan mr-1"></i>' + esc(datas || 'Sem datas') + '</span>' +
          '<span><i class="fa-solid fa-users text-fiel-cyan mr-1"></i>' + (vagas === null ? 'Vagas não informadas' : esc(vagas) + ' vaga' + (vagas === 1 ? '' : 's')) + '</span>' +
        '</div>' +
        (p.descricao ? '<p class="text-slate-500 text-sm mt-3 line-clamp-2">' + esc(p.descricao) + '</p>' : '') +

        '<div class="mt-4 flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">' +
          '<div class="min-w-0">' +
            '<p class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Preço</p>' +
            '<p class="font-display font-black text-base ' + (showPrice ? 'text-fiel-dark' : 'text-slate-400 line-through decoration-2') + ' truncate">' + esc(preco || 'Não informado') + '</p>' +
          '</div>' +
          '<button type="button" data-action="preco" data-id="' + id + '" aria-pressed="' + showPrice + '" ' +
            'class="shrink-0 inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg transition-colors ' +
            (showPrice ? 'bg-fiel-light text-fiel-blue hover:bg-sky-100' : 'bg-slate-200 text-slate-600 hover:bg-slate-300') + '" ' +
            'title="' + (showPrice ? 'Preço visível no site — clique para ocultar' : 'Preço oculto no site — clique para mostrar') + '">' +
            '<i class="fa-regular ' + (showPrice ? 'fa-eye' : 'fa-eye-slash') + '"></i>' + (showPrice ? 'Visível' : 'Oculto') +
          '</button>' +
        '</div>' +

        '<div class="mt-auto pt-4 flex items-center gap-2">' +
          '<button type="button" role="switch" aria-checked="' + !!p.ativo + '" data-action="ativo" data-id="' + id + '" class="switch" aria-label="Publicar no site"></button>' +
          '<span class="text-xs font-semibold text-slate-600 mr-auto">' + (p.ativo ? 'No site' : 'Fora do site') + '</span>' +
          '<button type="button" data-action="editar" data-id="' + id + '" class="w-10 h-10 rounded-full bg-fiel-light text-fiel-blue hover:bg-fiel-cyan hover:text-white flex items-center justify-center transition-colors" title="Editar" aria-label="Editar ' + esc(p.titulo) + '"><i class="fa-solid fa-pen"></i></button>' +
          '<button type="button" data-action="excluir" data-id="' + id + '" class="w-10 h-10 rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white flex items-center justify-center transition-colors" title="Excluir" aria-label="Excluir ' + esc(p.titulo) + '"><i class="fa-solid fa-trash-can"></i></button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function render() {
    stats();
    var list = filtered();
    $('pk-grid').innerHTML = list.map(cardHTML).join('');
    if (!list.length) {
      if (!state.pacotes.length) showEmpty('Nenhum destino cadastrado', 'Clique em “Adicionar destino” para criar o primeiro pacote.');
      else showEmpty('Nada encontrado', 'Nenhum pacote corresponde à busca ou ao filtro selecionado.');
    } else {
      $('pk-empty').classList.add('hidden');
    }
  }

  function findPkg(id) {
    for (var i = 0; i < state.pacotes.length; i++) if (String(state.pacotes[i].id) === String(id)) return state.pacotes[i];
    return null;
  }
  function replacePkg(row) {
    for (var i = 0; i < state.pacotes.length; i++) {
      if (String(state.pacotes[i].id) === String(row.id)) { state.pacotes[i] = row; return; }
    }
    state.pacotes.unshift(row);
  }

  /* =================================================================
     4. AÇÕES RÁPIDAS (publicar / mostrar preço)
     ================================================================= */
  async function quickToggle(btn, field) {
    var p = findPkg(btn.getAttribute('data-id'));
    if (!p) return;
    var novo = field === 'ativo' ? !p.ativo : !(p.mostrar_preco !== false);
    btn.disabled = true;
    var patch = {}; patch[field] = novo;
    var r = await sb.from('pacotes').update(patch).eq('id', p.id).select(COLS).single();
    btn.disabled = false;
    if (r.error) { toast('error', errMsg(r.error)); return; }
    replacePkg(r.data);
    render();
    if (field === 'ativo') toast('success', novo ? '“' + p.titulo + '” publicado no site.' : '“' + p.titulo + '” foi retirado do site.');
    else toast('success', novo ? 'Preço de “' + p.titulo + '” agora está visível.' : 'Preço de “' + p.titulo + '” agora está oculto para os visitantes.');
  }

  /* =================================================================
     5. STORAGE (imagens)
     ================================================================= */
  function validateFile(f) {
    if (!f) return 'Selecione uma imagem.';
    if (!IMG_TYPES[f.type]) return 'Formato não permitido. Use JPG, PNG, WEBP ou AVIF.';
    if (f.size > MAX_IMG) return 'A imagem tem ' + (f.size / 1048576).toFixed(1) + ' MB. O limite é 5 MB.';
    return '';
  }

  // Cada pacote tem sua pasta: pacotes/<id>/<timestamp>-<aleatório>.<ext>
  async function uploadImagem(pacoteId, file) {
    var rand = Math.random().toString(36).slice(2, 10);
    var path = String(pacoteId) + '/' + Date.now() + '-' + rand + '.' + IMG_TYPES[file.type];
    var up = await sb.storage.from(BUCKET).upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
    if (up.error) throw up.error;
    return { path: path, url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  }

  function storagePathFromUrl(url) {
    if (!url) return null;
    var marker = '/storage/v1/object/public/' + BUCKET + '/';
    var i = url.indexOf(marker);
    if (i === -1) return null; // imagem externa: não pertence ao bucket
    try { return decodeURIComponent(url.slice(i + marker.length).split('?')[0]); } catch (e) { return null; }
  }

  async function removeFiles(paths) {
    paths = paths.filter(Boolean);
    if (!paths.length) return;
    var r = await sb.storage.from(BUCKET).remove(paths);
    if (r.error) console.warn('[FielTour] Falha ao remover imagem antiga:', r.error.message);
  }

  async function removeFolder(pacoteId) {
    var r = await sb.storage.from(BUCKET).list(String(pacoteId), { limit: 100 });
    if (r.error || !r.data) return;
    await removeFiles(r.data.map(function (o) { return String(pacoteId) + '/' + o.name; }));
  }

  /* =================================================================
     6. FORMULÁRIO (adicionar / editar / alterar imagem)
     ================================================================= */
  var F = {};
  function cacheForm() {
    ['titulo', 'destino', 'descricao', 'preco', 'partida', 'retorno', 'vagas', 'imagem', 'mostrar-preco', 'ativo'].forEach(function (k) { F[k] = $('f-' + k); });
  }

  function setEye(on) {
    F['mostrar-preco'].setAttribute('aria-pressed', String(on));
    F['mostrar-preco'].className = 'shrink-0 w-12 rounded-xl border flex items-center justify-center transition-colors ' +
      (on ? 'border-sky-200 bg-fiel-light text-fiel-blue hover:bg-sky-100' : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200');
    F['mostrar-preco'].title = on ? 'Preço visível no site — clique para ocultar' : 'Preço oculto no site — clique para mostrar';
    F['mostrar-preco'].innerHTML = '<i class="fa-regular ' + (on ? 'fa-eye' : 'fa-eye-slash') + '"></i>';
    var hint = $('preco-hint');
    hint.className = 'text-xs mt-1.5 font-semibold ' + (on ? 'text-fiel-blue' : 'text-slate-500');
    hint.innerHTML = on
      ? '<i class="fa-regular fa-eye"></i> Preço visível para os visitantes'
      : '<i class="fa-regular fa-eye-slash"></i> Preço oculto no site (continua salvo e visível só aqui)';
  }
  function setAtivo(on) {
    F.ativo.setAttribute('aria-checked', String(on));
    $('ativo-label').textContent = on ? 'Publicado no site' : 'Oculto do site';
  }

  function setPreview(src, isNew) {
    var img = $('img-preview');
    if (src) { img.src = src; img.classList.remove('hidden'); $('img-placeholder').classList.add('hidden'); }
    else { img.removeAttribute('src'); img.classList.add('hidden'); $('img-placeholder').classList.remove('hidden'); }
    $('img-new-badge').classList.toggle('hidden', !isNew);
    $('img-undo').classList.toggle('hidden', !isNew);
    $('img-pick-text').textContent = src ? 'Trocar imagem' : 'Enviar imagem';
  }

  function clearNewFile() {
    if (state.filePreview) URL.revokeObjectURL(state.filePreview);
    state.file = null; state.filePreview = null;
    F.imagem.value = '';
  }

  function fieldError(key, msg) {
    var el = $('err-' + key);
    if (el) { el.textContent = msg || ''; el.classList.toggle('hidden', !msg); }
    var input = { titulo: F.titulo, destino: F.destino, preco: F.preco, vagas: F.vagas, datas: F.retorno }[key];
    if (input) { input.classList.toggle('border-red-400', !!msg); input.classList.toggle('border-slate-200', !msg); }
  }
  function resetErrors() {
    ['titulo', 'destino', 'preco', 'vagas', 'datas', 'imagem'].forEach(function (k) { fieldError(k, ''); });
    $('form-alert').classList.add('hidden');
  }

  function openForm(p, pickImage) {
    state.editing = p || null;
    clearNewFile();
    resetErrors();
    $('form-title').textContent = p ? 'Editar destino' : 'Adicionar destino';
    $('form-submit-text').textContent = p ? 'SALVAR ALTERAÇÕES' : 'SALVAR DESTINO';
    F.titulo.value = p ? (p.titulo || '') : '';
    F.destino.value = p ? (p.destino || '') : '';
    F.descricao.value = p ? (p.descricao || '') : '';
    F.preco.value = p && p.preco !== null && p.preco !== undefined ? Number(p.preco) : '';
    F.partida.value = p && p.data_partida ? String(p.data_partida).slice(0, 10) : '';
    F.retorno.value = p && p.data_retorno ? String(p.data_retorno).slice(0, 10) : '';
    F.vagas.value = p && p.vagas_disponiveis !== null && p.vagas_disponiveis !== undefined ? p.vagas_disponiveis : '';
    setEye(p ? p.mostrar_preco !== false : true);
    setAtivo(p ? !!p.ativo : true);
    setPreview(p ? U.safeImg(p.imagem_url) : '', false);
    updateCount();
    $('form-modal').classList.remove('hidden');
    lockScroll(true);
    if (pickImage) F.imagem.click(); // mesmo gesto do clique: o navegador permite abrir o seletor
    else setTimeout(function () { F.titulo.focus(); }, 50);
  }

  function closeForm() {
    $('form-modal').classList.add('hidden');
    lockScroll(false);
    clearNewFile();
    state.editing = null;
  }

  function updateCount() { $('desc-count').textContent = F.descricao.value.length + '/5000'; }

  function readForm() {
    resetErrors();
    var ok = true;
    var titulo = F.titulo.value.trim();
    var destino = F.destino.value.trim();
    var precoRaw = F.preco.value.trim();
    var vagasRaw = F.vagas.value.trim();
    var partida = F.partida.value || null;
    var retorno = F.retorno.value || null;

    if (!titulo) { fieldError('titulo', 'Informe o título do pacote.'); ok = false; }
    if (!destino) { fieldError('destino', 'Informe o destino da viagem.'); ok = false; }

    var preco = null;
    if (F.preco.validity && F.preco.validity.badInput) { fieldError('preco', 'Digite um valor numérico.'); ok = false; }
    else if (precoRaw !== '') {
      preco = Number(precoRaw);
      if (!isFinite(preco) || preco < 0) { fieldError('preco', 'O preço deve ser um número igual ou maior que zero.'); ok = false; }
      else preco = Math.round(preco * 100) / 100;
    }

    var vagas = null;
    if (F.vagas.validity && F.vagas.validity.badInput) { fieldError('vagas', 'Digite um número inteiro.'); ok = false; }
    else if (vagasRaw !== '') {
      vagas = Number(vagasRaw);
      if (!Number.isInteger(vagas) || vagas < 0) { fieldError('vagas', 'As vagas devem ser um número inteiro igual ou maior que zero.'); ok = false; }
    }

    if (partida && retorno && retorno < partida) { fieldError('datas', 'A data de retorno não pode ser anterior à partida.'); ok = false; }

    if (!ok) return null;
    return {
      titulo: titulo,
      destino: destino,
      descricao: F.descricao.value.trim() || null,
      preco: preco,
      mostrar_preco: F['mostrar-preco'].getAttribute('aria-pressed') === 'true',
      data_partida: partida,
      data_retorno: retorno,
      vagas_disponiveis: vagas,
      ativo: F.ativo.getAttribute('aria-checked') === 'true'
    };
  }

  async function submitForm(e) {
    e.preventDefault();
    var payload = readForm();
    if (!payload) { toast('error', 'Revise os campos destacados.'); return; }

    var btn = $('form-submit'), icon = $('form-submit-icon'), text = $('form-submit-text');
    var idleText = state.editing ? 'SALVAR ALTERAÇÕES' : 'SALVAR DESTINO';
    setBusy(btn, true, icon, text, state.file ? 'ENVIANDO IMAGEM...' : 'SALVANDO...', 'fa-solid fa-floppy-disk', idleText);

    try {
      if (state.editing) await saveEdit(state.editing, payload);
      else await saveNew(payload);
      closeForm();
    } catch (err) {
      var msg = errMsg(err);
      $('form-alert').textContent = msg;
      $('form-alert').classList.remove('hidden');
      toast('error', msg);
    } finally {
      setBusy(btn, false, icon, text, '', 'fa-solid fa-floppy-disk', idleText);
    }
  }

  async function saveNew(payload) {
    var ins = await sb.from('pacotes').insert(payload).select(COLS).single();
    if (ins.error) throw ins.error;
    var row = ins.data;
    replacePkg(row);

    if (state.file) {
      try {
        var up = await uploadImagem(row.id, state.file);
        var upd = await sb.from('pacotes').update({ imagem_url: up.url }).eq('id', row.id).select(COLS).single();
        if (upd.error) { await removeFiles([up.path]); throw upd.error; }
        row = upd.data;
        replacePkg(row);
      } catch (err) {
        render();
        toast('warn', 'Pacote salvo, mas a imagem não foi enviada: ' + errMsg(err) + ' Use “Alterar imagem” para tentar de novo.');
        return;
      }
    }
    render();
    toast('success', '“' + row.titulo + '” cadastrado' + (row.ativo ? ' e publicado no site.' : ' (oculto do site).'));
  }

  async function saveEdit(old, payload) {
    var uploaded = null;
    if (state.file) {
      uploaded = await uploadImagem(old.id, state.file);
      payload.imagem_url = uploaded.url;
    }
    var r = await sb.from('pacotes').update(payload).eq('id', old.id).select(COLS).single();
    if (r.error) {
      if (uploaded) await removeFiles([uploaded.path]); // desfaz o upload órfão
      throw r.error;
    }
    if (uploaded) {
      var oldPath = storagePathFromUrl(old.imagem_url);
      if (oldPath && oldPath !== uploaded.path) await removeFiles([oldPath]);
    }
    replacePkg(r.data);
    render();
    toast('success', uploaded ? 'Destino e imagem atualizados.' : 'Alterações salvas.');
  }

  /* =================================================================
     7. EXCLUSÃO (com confirmação)
     ================================================================= */
  var toDelete = null;
  function askDelete(p) {
    toDelete = p;
    $('confirm-name').textContent = '“' + p.titulo + '”';
    $('confirm-modal').classList.remove('hidden');
    lockScroll(true);
    setTimeout(function () { $('confirm-cancel').focus(); }, 50);
  }
  function closeConfirm() {
    $('confirm-modal').classList.add('hidden');
    lockScroll(false);
    toDelete = null;
  }
  async function doDelete() {
    if (!toDelete) return;
    var p = toDelete;
    var btn = $('confirm-ok');
    setBusy(btn, true, $('confirm-icon'), $('confirm-text'), 'EXCLUINDO...', 'fa-solid fa-trash-can', 'EXCLUIR');
    var r = await sb.from('pacotes').delete().eq('id', p.id).select('id');
    setBusy(btn, false, $('confirm-icon'), $('confirm-text'), '', 'fa-solid fa-trash-can', 'EXCLUIR');
    if (r.error) { toast('error', errMsg(r.error)); return; }
    if (!r.data || !r.data.length) { toast('error', 'O pacote não foi excluído (sem permissão ou já removido).'); closeConfirm(); loadPacotes(); return; }

    // Limpa as imagens do pacote no Storage
    await removeFolder(p.id);
    var extra = storagePathFromUrl(p.imagem_url);
    if (extra && extra.indexOf(String(p.id) + '/') !== 0) await removeFiles([extra]);

    state.pacotes = state.pacotes.filter(function (x) { return String(x.id) !== String(p.id); });
    closeConfirm();
    render();
    toast('success', '“' + p.titulo + '” foi excluído.');
  }

  /* =================================================================
     8. EVENTOS
     ================================================================= */
  function bindUI() {
    cacheForm();

    // Menu lateral (celular/tablet)
    var openSide = function (on) {
      $('sidebar').classList.toggle('-translate-x-full', !on);
      $('sidebar-backdrop').classList.toggle('hidden', !on);
    };
    $('sidebar-open').onclick = function () { openSide(true); };
    $('sidebar-close').onclick = function () { openSide(false); };
    $('sidebar-backdrop').onclick = function () { openSide(false); };

    // Logout
    document.querySelectorAll('.js-logout').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        await sb.auth.signOut();
        goLogin('saiu');
      });
    });

    // Filtros e busca
    document.querySelectorAll('.filter-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filtro = b.getAttribute('data-filter');
        document.querySelectorAll('.filter-btn').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('bg-fiel-dark', on); x.classList.toggle('text-white', on); x.classList.toggle('font-bold', on);
          x.classList.toggle('bg-slate-100', !on); x.classList.toggle('text-slate-700', !on); x.classList.toggle('font-semibold', !on);
        });
        render();
      });
    });
    var t;
    $('search').addEventListener('input', function (e) {
      clearTimeout(t);
      t = setTimeout(function () { state.busca = e.target.value; render(); }, 150);
    });
    $('btn-refresh').onclick = function () { if (!state.loading) loadPacotes(); };

    // Adicionar
    $('btn-add').onclick = function () { openForm(null); };

    // Ações nos cards
    $('pk-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      var p = findPkg(btn.getAttribute('data-id'));
      if (!p) return;
      var a = btn.getAttribute('data-action');
      if (a === 'editar') openForm(p);
      else if (a === 'imagem') openForm(p, true);
      else if (a === 'excluir') askDelete(p);
      else if (a === 'ativo') quickToggle(btn, 'ativo');
      else if (a === 'preco') quickToggle(btn, 'mostrar_preco');
    });

    // Formulário
    $('pk-form').addEventListener('submit', submitForm);
    document.querySelectorAll('.js-close-form').forEach(function (b) { b.onclick = closeForm; });
    F['mostrar-preco'].onclick = function () { setEye(F['mostrar-preco'].getAttribute('aria-pressed') !== 'true'); };
    F.ativo.onclick = function () { setAtivo(F.ativo.getAttribute('aria-checked') !== 'true'); };
    F.descricao.addEventListener('input', updateCount);
    // Limpa o aviso do campo assim que o usuário corrige
    [['titulo', F.titulo], ['destino', F.destino], ['preco', F.preco], ['vagas', F.vagas], ['datas', F.partida], ['datas', F.retorno]].forEach(function (x) {
      x[1].addEventListener('input', function () { fieldError(x[0], ''); });
    });

    F.imagem.addEventListener('change', function () {
      var f = F.imagem.files && F.imagem.files[0];
      if (!f) return;
      var err = validateFile(f);
      if (err) { fieldError('imagem', err); F.imagem.value = ''; return; }
      fieldError('imagem', '');
      clearNewFile();
      state.file = f;
      state.filePreview = URL.createObjectURL(f);
      setPreview(state.filePreview, true);
    });
    $('img-undo').onclick = function () {
      clearNewFile();
      setPreview(state.editing ? U.safeImg(state.editing.imagem_url) : '', false);
    };

    // Exclusão
    $('confirm-cancel').onclick = closeConfirm;
    $('confirm-ok').onclick = doDelete;
    $('confirm-modal').addEventListener('click', function (e) { if (e.target === $('confirm-modal')) closeConfirm(); });

    // Esc fecha modais
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('confirm-modal').classList.contains('hidden')) closeConfirm();
      else if (!$('form-modal').classList.contains('hidden') && !$('form-submit').disabled) closeForm();
    });
  }

  boot();
})();
