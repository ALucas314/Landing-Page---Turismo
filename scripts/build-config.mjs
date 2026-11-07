// Gera assets/js/env.js a partir do .env (ou das variáveis de ambiente).
// Somente valores PÚBLICOS vão para o navegador. Se alguém colocar a
// chave service_role/secret em SUPABASE_ANON_KEY, o build é recusado.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, isSecretKey, ROOT } from './env.mjs';

const { get, hasFile } = loadEnv();
const url = get('SUPABASE_URL').replace(/\/+$/, '');
const anon = get('SUPABASE_ANON_KEY');
const bucket = get('SUPABASE_STORAGE_BUCKET', 'pacotes') || 'pacotes';

const problems = [];
if (!url) problems.push('SUPABASE_URL está vazio.');
else if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) problems.push('SUPABASE_URL deve ser algo como https://SEU-PROJETO.supabase.co');
if (!anon) problems.push('SUPABASE_ANON_KEY está vazio.');
if (isSecretKey(anon)) {
  console.error('\n✖ SUPABASE_ANON_KEY contém uma chave PRIVILEGIADA (service_role / sb_secret).');
  console.error('  Ela daria acesso total ao banco para qualquer visitante. Use a chave "anon public" ou "publishable".\n');
  process.exit(1);
}
if (anon && get('SUPABASE_SERVICE_ROLE_KEY') && anon === get('SUPABASE_SERVICE_ROLE_KEY')) {
  console.error('\n✖ SUPABASE_ANON_KEY é igual a SUPABASE_SERVICE_ROLE_KEY. Use a chave pública.\n');
  process.exit(1);
}

const config = { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_STORAGE_BUCKET: bucket };
const out = join(ROOT, 'assets', 'js', 'env.js');
mkdirSync(join(ROOT, 'assets', 'js'), { recursive: true });
writeFileSync(out,
  '/* Gerado automaticamente por "npm run config" — NÃO edite à mão.\n' +
  '   Contém apenas valores PÚBLICOS (URL e chave anon/publishable).\n' +
  '   A segurança dos dados é garantida pelas políticas RLS do Supabase. */\n' +
  'window.FIELTOUR_ENV = Object.freeze(' + JSON.stringify(config, null, 2) + ');\n');

if (!hasFile) console.warn('! Arquivo .env não encontrado — usando apenas variáveis do ambiente.');
if (problems.length) {
  console.warn('! assets/js/env.js gerado, mas a configuração está incompleta:');
  problems.forEach((p) => console.warn('  - ' + p));
} else {
  console.log('✔ assets/js/env.js gerado para ' + url);
}
