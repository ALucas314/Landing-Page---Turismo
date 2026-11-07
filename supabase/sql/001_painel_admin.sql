-- =====================================================================
-- FielTour — Painel administrativo (Supabase)
-- Execute UMA vez no Supabase > SQL Editor. O script é idempotente:
-- pode ser executado de novo sem duplicar nada.
--
-- O que este script faz (sem criar tabelas novas):
--   1. Adiciona a coluna public.pacotes.mostrar_preco (boolean, padrão TRUE).
--   2. Cria validações no banco (trigger + CHECK constraints).
--   3. Cria a função public.is_admin() usada pelas políticas.
--   4. Impede que alguém se promova a administrador pelo site.
--   5. Ativa RLS e recria as políticas de public.perfis e public.pacotes.
--   6. Cria a view public.pacotes_publicos (o que o site público lê),
--      que entrega o preço como NULL quando mostrar_preco = FALSE.
--   7. Cria o bucket "pacotes" no Storage e suas políticas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Relacionamento perfis.id -> auth.users.id
--    Só cria a FK se ainda não existir nenhuma FK em perfis.id.
--    NOT VALID: não verifica linhas antigas, só as novas.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.perfis'::regclass
      and c.contype = 'f'
      and a.attname = 'id'
  ) then
    alter table public.perfis
      add constraint perfis_id_auth_users_fkey
      foreign key (id) references auth.users (id) on delete cascade not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Coluna de visibilidade do preço
-- ---------------------------------------------------------------------
alter table public.pacotes
  add column if not exists mostrar_preco boolean not null default true;

-- ---------------------------------------------------------------------
-- 2. Validações no banco (valem para QUALQUER cliente, não só o painel)
-- ---------------------------------------------------------------------
create or replace function public.pacotes_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.titulo    := nullif(btrim(new.titulo), '');
  new.destino   := nullif(btrim(new.destino), '');
  new.descricao := nullif(btrim(new.descricao), '');
  new.imagem_url := nullif(btrim(new.imagem_url), '');

  if new.titulo is null then
    raise exception 'O título do pacote é obrigatório.';
  end if;
  if char_length(new.titulo) > 150 then
    raise exception 'O título deve ter no máximo 150 caracteres.';
  end if;
  if new.destino is null then
    raise exception 'O destino do pacote é obrigatório.';
  end if;
  if char_length(new.destino) > 150 then
    raise exception 'O destino deve ter no máximo 150 caracteres.';
  end if;
  if new.descricao is not null and char_length(new.descricao) > 5000 then
    raise exception 'A descrição deve ter no máximo 5000 caracteres.';
  end if;
  if new.preco is not null and new.preco < 0 then
    raise exception 'O preço não pode ser negativo.';
  end if;
  if new.vagas_disponiveis is not null and new.vagas_disponiveis < 0 then
    raise exception 'As vagas disponíveis não podem ser negativas.';
  end if;
  if new.data_partida is not null and new.data_retorno is not null
     and new.data_retorno < new.data_partida then
    raise exception 'A data de retorno não pode ser anterior à data de partida.';
  end if;
  if new.imagem_url is not null and new.imagem_url !~* '^https://' then
    raise exception 'A URL da imagem precisa começar com https://';
  end if;
  if new.mostrar_preco is null then
    new.mostrar_preco := true;
  end if;
  return new;
end;
$$;

drop trigger if exists pacotes_validar on public.pacotes;
create trigger pacotes_validar
  before insert or update on public.pacotes
  for each row execute function public.pacotes_validar();

-- CHECK constraints como segunda camada (NOT VALID = não quebra dados antigos)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pacotes_preco_nao_negativo') then
    alter table public.pacotes add constraint pacotes_preco_nao_negativo
      check (preco is null or preco >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pacotes_vagas_nao_negativas') then
    alter table public.pacotes add constraint pacotes_vagas_nao_negativas
      check (vagas_disponiveis is null or vagas_disponiveis >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pacotes_datas_coerentes') then
    alter table public.pacotes add constraint pacotes_datas_coerentes
      check (data_partida is null or data_retorno is null or data_retorno >= data_partida) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. is_admin(): o usuário logado é administrador?
--    SECURITY DEFINER para ler perfis sem recursão de RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid()
      and tipo_usuario::text = 'administrador'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Ninguém se torna administrador pelo site / pela API pública.
--    Só o SQL Editor do Supabase (postgres) ou a chave service_role
--    (script scripts/criar-admin.mjs, executado no servidor) podem.
-- ---------------------------------------------------------------------
create or replace function public.perfis_protege_tipo_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tipo_usuario::text = 'administrador'
     and (tg_op = 'INSERT' or old.tipo_usuario::text is distinct from 'administrador') then
    if session_user in ('postgres', 'supabase_admin')
       or coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    raise exception 'Somente o responsável pela FielTour pode cadastrar administradores.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists perfis_protege_tipo_usuario on public.perfis;
create trigger perfis_protege_tipo_usuario
  before insert or update on public.perfis
  for each row execute function public.perfis_protege_tipo_usuario();

-- ---------------------------------------------------------------------
-- 5. RLS
--    ATENÇÃO: remove as políticas antigas destas duas tabelas para que
--    nenhuma política permissiva antiga (ex.: "allow all") continue
--    liberando acesso. As novas políticas estão logo abaixo.
-- ---------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('perfis', 'pacotes')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.perfis  enable row level security;
alter table public.pacotes enable row level security;

-- perfis: cada um lê o próprio perfil; administradores leem todos.
-- Sem políticas de INSERT/UPDATE/DELETE: pelo site ninguém altera perfis.
create policy perfis_select_proprio_ou_admin
  on public.perfis for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- pacotes: somente administradores leem/escrevem a TABELA.
-- O público lê pela view public.pacotes_publicos (abaixo).
create policy pacotes_admin_select
  on public.pacotes for select
  to authenticated
  using (public.is_admin());

create policy pacotes_admin_insert
  on public.pacotes for insert
  to authenticated
  with check (public.is_admin());

create policy pacotes_admin_update
  on public.pacotes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy pacotes_admin_delete
  on public.pacotes for delete
  to authenticated
  using (public.is_admin());

-- Visitantes não acessam a tabela diretamente
revoke all on public.pacotes from anon;
revoke all on public.perfis  from anon;

-- ---------------------------------------------------------------------
-- 6. View pública: só pacotes ativos e preço só quando mostrar_preco.
--    O preço oculto NUNCA sai do banco para o visitante.
-- ---------------------------------------------------------------------
drop view if exists public.pacotes_publicos;
create view public.pacotes_publicos
with (security_invoker = false)
as
select
  p.id,
  p.titulo,
  p.descricao,
  p.destino,
  case when p.mostrar_preco then p.preco end as preco,
  p.mostrar_preco,
  p.data_partida,
  p.data_retorno,
  p.vagas_disponiveis,
  p.imagem_url,
  p.data_criacao
from public.pacotes p
where p.ativo is true;

revoke all on public.pacotes_publicos from public, anon, authenticated;
grant select on public.pacotes_publicos to anon, authenticated;

comment on view public.pacotes_publicos is
  'Vitrine pública da FielTour: somente pacotes ativos; preco = NULL quando mostrar_preco = false.';

-- ---------------------------------------------------------------------
-- 7. Storage: bucket "pacotes" (leitura pública, escrita só de admins)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pacotes', 'pacotes', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fieltour_pacotes_admin_select" on storage.objects;
drop policy if exists "fieltour_pacotes_admin_insert" on storage.objects;
drop policy if exists "fieltour_pacotes_admin_update" on storage.objects;
drop policy if exists "fieltour_pacotes_admin_delete" on storage.objects;

-- Visitantes veem as imagens pela URL pública do bucket (não precisa de
-- política de SELECT para isso). Listar/gerenciar arquivos: só admins.
create policy "fieltour_pacotes_admin_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'pacotes' and public.is_admin());

create policy "fieltour_pacotes_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'pacotes' and public.is_admin());

create policy "fieltour_pacotes_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'pacotes' and public.is_admin())
  with check (bucket_id = 'pacotes' and public.is_admin());

create policy "fieltour_pacotes_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'pacotes' and public.is_admin());
