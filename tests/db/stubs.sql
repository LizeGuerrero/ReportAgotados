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

-- Supabase instala las extensiones en el esquema "extensions" (las búsquedas usan extensions.unaccent).
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Esquema "realtime" de Supabase (lo mínimo): la tabla donde se aplican las políticas de los canales
-- privados y realtime.topic(), que en Supabase devuelve el tema del canal que se está autorizando.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  extension text not null,
  payload jsonb,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as
  $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to authenticated;
