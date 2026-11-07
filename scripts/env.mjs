// Lê o arquivo .env (sem dependências). Variáveis já definidas no
// ambiente (ex.: painel da Vercel/Netlify) têm prioridade sobre o .env.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  const file = join(ROOT, '.env');
  const fromFile = {};
  if (existsSync(file)) {
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fromFile[key] = val;
    }
  }
  const get = (k, def = '') => {
    const v = process.env[k];
    return (v !== undefined && v !== '') ? v : (fromFile[k] ?? def);
  };
  return { get, hasFile: existsSync(file) };
}

/** Retorna true se a chave for privilegiada (service_role / sb_secret). */
export function isSecretKey(key) {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return payload.role === 'service_role';
    } catch { /* não é JWT */ }
  }
  return false;
}
