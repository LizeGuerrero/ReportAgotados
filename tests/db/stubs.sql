-- Simula, en un Postgres local, lo mínimo de Supabase que necesita el esquema:
-- los roles anon / authenticated / service_role y el esquema "auth" (users, uid(), role()).
-- El usuario "autenticado" se elige con:  select set_config('app.uid', '<uuid>', false);
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter role service_role bypassrls;   -- como en Supabase: la llave secreta se salta el RLS

create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255),
  email_confirmed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('app.role', true), ''), 'anon') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
