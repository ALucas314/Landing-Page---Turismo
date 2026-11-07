# FielTour — Site + Painel Administrativo (Supabase)

Site estático (HTML + Tailwind CDN + supabase-js) com:

- **Página pública** (`index.html`): sem login. A seção *Próximos Destinos* lê os pacotes direto do Supabase.
- **Login de administradores** (`login.html`): Supabase Auth + verificação de `public.perfis.tipo_usuario = 'administrador'`.
- **Painel** (`admin.html`): cadastrar, editar, excluir, publicar/ocultar pacotes, trocar imagens e mostrar/ocultar preços.

## Arquitetura (e por que não há um servidor Express)

O projeto continua **estático**. O "backend" é o próprio Supabase:

| Camada | Onde fica | O que garante |
|---|---|---|
| Autenticação | Supabase Auth | Senhas com hash, sessões/tokens, limite de tentativas |
| Autorização | Postgres **RLS** + `public.is_admin()` | Só admins leem/escrevem `pacotes`; ninguém altera `perfis` pelo site |
| Validação | Trigger `pacotes_validar` + CHECK constraints | Título/destino obrigatórios, preço/vagas ≥ 0, retorno ≥ partida, limites de tamanho |
| Anti-escalada | Trigger `perfis_protege_tipo_usuario` | Ninguém vira administrador pela API pública |
| Preço oculto | View `public.pacotes_publicos` | Visitante recebe `preco = NULL` quando `mostrar_preco = false` (o valor nem chega ao navegador) |
| Imagens | Supabase Storage (bucket `pacotes`) | Leitura pública; upload/troca/exclusão só por admins |

Um servidor próprio só repassaria as mesmas chamadas ao Supabase e exigiria hospedagem extra. Os únicos
códigos Node são **ferramentas locais/de build**, sem dependências:

- `scripts/build-config.mjs` → gera `assets/js/env.js` a partir do `.env` (só URL + chave pública; recusa chave secreta).
- `scripts/serve.mjs` → servidor local de desenvolvimento (bloqueia `.env`, `scripts/`, `supabase/`).
- `scripts/criar-admin.mjs` → cria o primeiro administrador usando a chave **service_role**, que fica só no seu computador.

```
├── index.html              (público — seção Próximos Destinos dinâmica)
├── login.html              (login admin)
├── redefinir-senha.html    (recuperação de senha)
├── admin.html              (NOVO — painel)
├── assets/css/style.css    (original)
├── assets/img/Logo.png     (original)
├── assets/js/
│   ├── script.js           (original)
│   ├── supabase-client.js  (NOVO — cliente compartilhado + verificação de admin)
│   ├── destinos.js         (NOVO — cards públicos)
│   ├── admin.js            (NOVO — lógica do painel)
│   └── env.js              (GERADO por npm run config — não versionado)
├── scripts/                (NOVO — ferramentas Node sem dependências)
├── supabase/sql/
│   ├── 001_painel_admin.sql
│   └── 002_primeiro_admin.sql
├── .env / .env.example / .gitignore
└── package.json
```

> `assets/css/style.css`, `assets/js/script.js` e `assets/img/Logo.png` são os **arquivos originais do site, sem alterações**,
> e fazem parte do projeto. O painel (`admin.html`) carrega o mesmo `style.css`, usa a mesma paleta de cores do
> `script.js` (`#00A8E8`, `#0C4A6E`, `#082F49`...) e a logo da FielTour.

## 1. Pré-requisitos

- Node.js **18 ou superior** (só para gerar a configuração e rodar o servidor local).
- `npm install` não é necessário: o projeto não tem dependências. A biblioteca `supabase-js` é carregada por CDN.

## 2. Configurar o banco (uma vez)

1. Supabase > **SQL Editor** > cole e execute `supabase/sql/001_painel_admin.sql`.
   - Adiciona `pacotes.mostrar_preco` (padrão `TRUE`), validações, RLS, a view pública e o bucket `pacotes`.
   - Não cria tabelas. Pode ser executado de novo sem problemas.
   - **Atenção:** ele remove as políticas RLS antigas de `perfis` e `pacotes` e cria as novas (para nenhuma política permissiva antiga continuar valendo).
2. Supabase > **Authentication > Sign In / Providers** > desative **"Allow new users to sign up"**.
   Assim ninguém cria conta pelo site (o painel já bloquearia, mas isso fecha a porta de vez).
3. Supabase > **Authentication > URL Configuration**: em *Redirect URLs*, adicione o endereço do
   `redefinir-senha.html` (ex.: `http://localhost:5500/redefinir-senha.html` e o do seu domínio).

## 3. Configurar as credenciais

1. Supabase > **Project Settings > API** (ou *API Keys*).
2. Preencha o `.env` (já criado, vazio — modelo em `.env.example`):

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=eyJ...            # "anon public" ou "sb_publishable_..."
SUPABASE_STORAGE_BUCKET=pacotes
SUPABASE_SERVICE_ROLE_KEY=          # opcional: só para npm run criar-admin
PORT=5500
```

3. Gere a configuração do navegador:

```bash
npm run config
```

> A chave **anon/publishable** é pública por natureza: quem protege os dados é o RLS.
> A chave **service_role / sb_secret** nunca vai para o navegador — o build é recusado se ela for colocada em `SUPABASE_ANON_KEY`.

## 4. Rodar localmente

```bash
npm run dev
```

- Site: http://localhost:5500/index.html
- Login: http://localhost:5500/login.html
- Painel: http://localhost:5500/admin.html

## 5. Cadastrar o primeiro administrador

**Opção A — pelo painel do Supabase (sem chave secreta):**

1. **Authentication > Users > Add user > Create new user**: e-mail + senha, marque *Auto Confirm User*.
2. **SQL Editor**: abra `supabase/sql/002_primeiro_admin.sql`, troque o e-mail e o nome, execute.

**Opção B — pelo terminal (usa `SUPABASE_SERVICE_ROLE_KEY` do `.env`):**

```bash
npm run criar-admin -- --email admin@fieltour.com.br --nome "Nome Completo"
```

A senha é digitada de forma oculta e guardada só como hash no Supabase Auth. Se o usuário já existir, ele só é promovido.

## 6. Testar

| Teste | Resultado esperado |
|---|---|
| Abrir `index.html` sem login | Página abre normalmente; Próximos Destinos mostra só pacotes **ativos** |
| Login com admin | Vai para `admin.html` com nome do admin no menu |
| Login com usuário sem `tipo_usuario = 'administrador'` | Sessão encerrada + "Acesso restrito aos administradores" |
| Abrir `admin.html` sem login | Redireciona para `login.html` |
| Adicionar destino com imagem | Aparece no painel e, se publicado, na página inicial |
| Clicar no olho do preço | Preço some do site (a view entrega `NULL`), continua visível no painel |
| Desligar "No site" | Pacote some da página inicial |
| Alterar imagem | Nova imagem enviada para `pacotes/<id>/...`, a antiga é apagada do Storage |
| Excluir | Pede confirmação; remove o pacote e as imagens dele |
| Sair | Encerra a sessão e volta ao login |
| "Manter-me conectado" desmarcado | Sessão termina ao fechar o navegador |

A página inicial busca os dados a cada carregamento e atualiza sozinha a cada 60 s (e ao voltar para a aba).

Teste de segurança rápido (no console do navegador, **deslogado**, em `index.html`):

```js
await FielTour.client.from('pacotes').select('*')            // → erro de permissão
await FielTour.client.from('pacotes_publicos').select('*')   // → só ativos, preço NULL quando oculto
```

## 7. Publicar (deploy)

- **Netlify / Vercel / Cloudflare Pages:** comando de build `npm run build`, pasta de publicação = raiz do projeto.
  Cadastre `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_STORAGE_BUCKET` nas variáveis de ambiente do serviço
  (**não** cadastre a service_role lá).
- **GitHub Pages / hospedagem sem build:** rode `npm run config` localmente e envie o `assets/js/env.js`
  (remova a linha dele do `.gitignore`). Ele contém apenas valores públicos. O `.env` continua fora do Git.

## Observações

- Os cards de exemplo e os filtros por categoria da seção Próximos Destinos foram removidos: a tabela `pacotes`
  não tem coluna de categoria e o site não deve mostrar pacotes fictícios. Se quiser os filtros de volta, dá para
  adicionar uma coluna `categoria` depois.
- Sem pacotes ativos, a seção mostra "Novos roteiros em breve. Fale com um consultor!".
- Limite de imagem: 5 MB (JPG, PNG, WEBP, AVIF) — validado no navegador e no bucket.
