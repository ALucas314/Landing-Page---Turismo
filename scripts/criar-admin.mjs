// Cadastra (ou promove) um administrador da FielTour.
// Roda SOMENTE no seu computador/servidor, usando a chave privilegiada
// SUPABASE_SERVICE_ROLE_KEY do .env — ela nunca vai para o navegador.
//
// Uso:
//   npm run criar-admin -- --email admin@fieltour.com.br --nome "Fulano de Tal"
//
// A senha é digitada de forma oculta no terminal e enviada ao Supabase
// Auth, que guarda apenas o hash. Nada de senha em public.perfis.
import { createInterface } from 'node:readline';
import { loadEnv, isSecretKey } from './env.mjs';

const { get } = loadEnv();
const URL_ = get('SUPABASE_URL').replace(/\/+$/, '');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? (process.argv[i + 1] || '') : '';
}
function fail(msg) { console.error('\n✖ ' + msg + '\n'); process.exit(1); }

const email = arg('email').trim().toLowerCase();
const nome = arg('nome').trim();

if (!URL_) fail('Preencha SUPABASE_URL no .env.');
if (!KEY) fail('Preencha SUPABASE_SERVICE_ROLE_KEY no .env (Supabase > Project Settings > API > service_role/secret).');
if (!isSecretKey(KEY)) fail('SUPABASE_SERVICE_ROLE_KEY não parece ser a chave service_role/secret.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Informe um e-mail válido: --email admin@exemplo.com');
if (!nome) fail('Informe o nome: --nome "Nome Completo"');

// Chaves novas (sb_secret_...) vão só no header apikey; chaves legadas (JWT) também no Authorization.
const headers = { apikey: KEY, 'Content-Type': 'application/json' };
if (!KEY.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + KEY;

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (s.includes('\n')) rl.output.write('\n'); };
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
    muted = true;
  });
}

async function findUserByEmail() {
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!r.ok) fail('Não foi possível listar usuários: ' + (await r.text()));
    const body = await r.json();
    const users = body.users || [];
    const u = users.find((x) => (x.email || '').toLowerCase() === email);
    if (u) return u;
    if (users.length < 200) return null;
  }
  return null;
}

let user = await findUserByEmail();

if (user) {
  console.log(`• Usuário ${email} já existe no Supabase Auth — apenas promovendo a administrador.`);
} else {
  const senha = await askHidden('Senha do novo administrador (mín. 8 caracteres): ');
  const conf = await askHidden('Confirme a senha: ');
  if (senha.length < 8) fail('A senha precisa ter pelo menos 8 caracteres.');
  if (senha !== conf) fail('As senhas não conferem.');
  const r = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: nome } })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) fail('Erro ao criar usuário: ' + (body.msg || body.message || r.status));
  user = body.user || body;
  console.log(`✔ Usuário criado no Supabase Auth (${user.id}).`);
}

const r2 = await fetch(`${URL_}/rest/v1/perfis?on_conflict=id`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify({ id: user.id, nome_completo: nome, tipo_usuario: 'administrador' })
});
const perfil = await r2.json().catch(() => ({}));
if (!r2.ok) fail('Erro ao gravar public.perfis: ' + (perfil.message || r2.status) +
  '\n  Confira se o script supabase/sql/001_painel_admin.sql já foi executado.');

console.log(`✔ ${email} agora é administrador (public.perfis.tipo_usuario = 'administrador').`);
console.log('  Teste em /login.html.\n');
