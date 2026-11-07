-- =====================================================================
-- FielTour — Promover um usuário do Supabase Auth a administrador
--
-- Antes: crie o usuário em Supabase > Authentication > Users >
--        "Add user" > "Create new user" (e-mail + senha, marque
--        "Auto Confirm User"). A senha fica com hash no Supabase Auth;
--        ela NUNCA é gravada em public.perfis.
--
-- Depois: troque o e-mail e o nome abaixo e execute no SQL Editor.
-- =====================================================================

insert into public.perfis (id, nome_completo, tipo_usuario)
select u.id, 'NOME DO ADMINISTRADOR', 'administrador'
from auth.users u
where lower(u.email) = lower('EMAIL_DO_ADMINISTRADOR@exemplo.com')
on conflict (id) do update
  set tipo_usuario  = 'administrador',
      nome_completo = coalesce(nullif(excluded.nome_completo, ''), public.perfis.nome_completo);

-- Conferência: deve retornar 1 linha com tipo_usuario = administrador
select p.id, u.email, p.nome_completo, p.tipo_usuario, p.data_criacao
from public.perfis p
join auth.users u on u.id = p.id
where lower(u.email) = lower('EMAIL_DO_ADMINISTRADOR@exemplo.com');

-- Para REMOVER o acesso de um administrador depois (opcional):
-- update public.perfis set tipo_usuario = 'cliente'   -- use o valor que seu projeto já usa
-- where id = (select id from auth.users where lower(email) = lower('EMAIL@exemplo.com'));
