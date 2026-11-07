/* =====================================================================
   FielTour — cliente Supabase compartilhado
   Carregar DEPOIS de: supabase-js (CDN) e assets/js/env.js
   Usa SOMENTE a chave pública (anon/publishable). Toda a proteção dos
   dados é feita no banco (RLS, triggers e políticas do Storage).
   ===================================================================== */
(function () {
  'use strict';

  var env = window.FIELTOUR_ENV || {};
  var url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  var key = String(env.SUPABASE_ANON_KEY || '').trim();
  var BUCKET = String(env.SUPABASE_STORAGE_BUCKET || 'pacotes');
  var REMEMBER_KEY = 'fieltour_manter_conectado';
  var ADMIN_TYPE = 'administrador';

  var NOT_CONFIGURED_MSG = 'Supabase ainda não configurado: preencha o arquivo .env e rode "npm run config".';

  // Barreira extra: nunca aceitar chave privilegiada no navegador.
  function isSecretKey(k) {
    if (!k) return false;
    if (k.indexOf('sb_secret_') === 0) return true;
    var p = k.split('.');
    if (p.length === 3) {
      try {
        var payload = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload && payload.role === 'service_role';
      } catch (e) { /* não é JWT */ }
    }
    return false;
  }

  var secret = isSecretKey(key);
  if (secret) {
    console.error('[FielTour] Chave privilegiada detectada no frontend. Conexão bloqueada. Use a chave anon/publishable.');
  }
  var configured = !secret && /^https:\/\//.test(url) && key.length > 20;

  /* ---- "Manter-me conectado": localStorage (lembrar) ou sessionStorage ---- */
  function store(name) { try { return window[name]; } catch (e) { return null; } }
  function sget(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function sset(s, k, v) { try { if (s) s.setItem(k, v); } catch (e) {} }
  function sdel(s, k) { try { if (s) s.removeItem(k); } catch (e) {} }
  function remember() { return sget(store('localStorage'), REMEMBER_KEY) === '1'; }

  var authStorage = {
    getItem: function (k) {
      var v = sget(store('sessionStorage'), k);
      return v !== null ? v : sget(store('localStorage'), k);
    },
    setItem: function (k, v) {
      if (remember()) { sset(store('localStorage'), k, v); sdel(store('sessionStorage'), k); }
      else { sset(store('sessionStorage'), k, v); sdel(store('localStorage'), k); }
    },
    removeItem: function (k) { sdel(store('sessionStorage'), k); sdel(store('localStorage'), k); }
  };

  var client = null;
  if (configured && window.supabase && typeof window.supabase.createClient === 'function') {
    client = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage }
    });
  } else if (configured) {
    configured = false;
    console.error('[FielTour] Biblioteca supabase-js não carregou.');
  }

  /**
   * Verifica no SERVIDOR quem está logado e se é administrador.
   * getUser() valida o token com o Supabase Auth (não confia no navegador)
   * e o perfil é lido de public.perfis (protegido por RLS).
   * @returns {Promise<{status:'ok'|'sem-sessao'|'negado'|'erro', user?, perfil?, error?}>}
   */
  async function checkAdmin() {
    if (!client) return { status: 'erro', error: new Error(NOT_CONFIGURED_MSG) };
    var sess = await client.auth.getSession();
    if (!sess.data || !sess.data.session) return { status: 'sem-sessao' };

    var u = await client.auth.getUser();
    if (u.error || !u.data || !u.data.user) return { status: 'sem-sessao' };
    var user = u.data.user;

    var r = await client.from('perfis')
      .select('id, nome_completo, tipo_usuario')
      .eq('id', user.id)
      .maybeSingle();
    if (r.error) return { status: 'erro', user: user, error: r.error };
    if (!r.data || String(r.data.tipo_usuario) !== ADMIN_TYPE) return { status: 'negado', user: user };
    return { status: 'ok', user: user, perfil: r.data };
  }

  function setRemember(on) {
    var ls = store('localStorage');
    if (on) sset(ls, REMEMBER_KEY, '1'); else sdel(ls, REMEMBER_KEY);
  }

  /* ---------------- utilitários de exibição (site e painel) ---------------- */
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Aceita "2026-12-20", "2026-12-20T00:00:00+00:00"... sem problemas de fuso.
  function parseDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3], iso: m[0] } : null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(v) {
    var d = parseDate(v);
    return d ? pad(d.d) + ' de ' + MESES[d.m - 1] : '';
  }
  function fmtDateShort(v) {
    var d = parseDate(v);
    return d ? pad(d.d) + '/' + pad(d.m) + '/' + d.y : '';
  }
  function fmtRange(a, b) {
    var x = parseDate(a), y = parseDate(b);
    if (x && y && x.iso !== y.iso) {
      if (x.y === y.y && x.m === y.m) return pad(x.d) + ' a ' + pad(y.d) + ' de ' + MESES[y.m - 1];
      var sameYear = x.y === y.y;
      return pad(x.d) + ' de ' + MESES[x.m - 1] + (sameYear ? '' : ' de ' + x.y) + ' a ' + pad(y.d) + ' de ' + MESES[y.m - 1] + (sameYear ? '' : ' de ' + y.y);
    }
    if (x) return fmtDate(a);
    if (y) return 'Retorno em ' + fmtDate(b);
    return '';
  }
  var BRL = null;
  try { BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (e) {}
  function fmtPrice(v) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    if (!isFinite(n)) return '';
    return BRL ? BRL.format(n) : 'R$ ' + n.toFixed(2).replace('.', ',');
  }
  function safeImg(u) {
    return (typeof u === 'string' && /^https:\/\//i.test(u)) ? u : '';
  }

  window.FielTour = {
    configured: configured,
    client: client,
    bucket: BUCKET,
    NOT_CONFIGURED_MSG: NOT_CONFIGURED_MSG,
    checkAdmin: checkAdmin,
    setRemember: setRemember,
    util: { esc: esc, parseDate: parseDate, fmtDate: fmtDate, fmtDateShort: fmtDateShort, fmtRange: fmtRange, fmtPrice: fmtPrice, safeImg: safeImg }
  };
})();
