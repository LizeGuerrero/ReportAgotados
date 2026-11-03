\set ON_ERROR_STOP 1
-- Pruebas de las preferencias de CXP por usuario: aislamiento, permisos, validaciones y restablecer.
create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin begin execute p_sql; exception when others then
  if sqlerrm ilike '%'||p_like||'%' then raise notice 'ok  bloqueado [%]', p_like; return; end if;
  raise exception 'ERROR DISTINTO [%]: %', p_like, sqlerrm; end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql; end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

-- A (admin) crea la org. B entra como Comercial (sin CXP). C entra como admin (con CXP).
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Cxp Prefs','CXP-7777') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as r_com from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as r_adm from public.roles where organizacion_id=:'org'::uuid and nombre='admin' \gset
select id as sede from public.sedes where organizacion_id=:'org'::uuid limit 1 \gset

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('CXP-7777');
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false); select public.solicitar_union('CXP-7777');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org'::uuid \gset
select id as mid_c from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000c3' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid, true, :'r_com'::uuid, :'sede'::uuid);
select public.resolver_solicitud(:'mid_c'::uuid, true, :'r_adm'::uuid, :'sede'::uuid);

-- Sin nada guardado devuelve null
select public.t_eq('sin guardar devuelve null', (select (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente') is null)::text), 'true');

-- A guarda y lo recupera
select public.cxp_prefs_guardar(:'org'::uuid,'hoja_pendiente','{"v":2,"congelar":2}'::jsonb);
select public.t_eq('A recupera lo suyo', (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente'))->>'congelar', '2');

-- Actualizar reemplaza, no duplica
select public.cxp_prefs_guardar(:'org'::uuid,'hoja_pendiente','{"v":2,"congelar":3}'::jsonb);
select public.t_eq('actualiza el valor', (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente'))->>'congelar', '3');
reset role;
select public.t_eq('una sola fila por usuario y clave', (select count(*)::text from public.cxp_preferencias where usuario_id='00000000-0000-0000-0000-0000000000a1'), '1');

-- C (también con permiso) no ve ni pisa lo de A
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_eq('C no ve lo de A', (select (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente') is null)::text), 'true');
select public.cxp_prefs_guardar(:'org'::uuid,'hoja_pendiente','{"v":2,"congelar":1}'::jsonb);
select public.t_eq('C tiene lo suyo', (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente'))->>'congelar', '1');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_eq('lo de A no cambió', (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente'))->>'congelar', '3');
-- Lectura directa: solo sus filas
select public.t_eq('RLS: A solo ve su fila', (select count(*)::text from public.cxp_preferencias), '1');
-- No se escribe directo en la tabla
select public.t_err(format($$insert into public.cxp_preferencias(organizacion_id,usuario_id,clave,valor) values (%L,%L,'general','{}')$$, :'org', '00000000-0000-0000-0000-0000000000a1'), 'permission denied');

-- B (sin permisos de CXP) queda fuera
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.cxp_prefs_obtener(%L,'general')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_prefs_guardar(%L,'general','{}')$$, :'org'), 'Sin permiso');

-- Validaciones
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.cxp_prefs_guardar(%L,'otra','{}')$$, :'org'), 'no válida');
select public.t_err(format($$select public.cxp_prefs_guardar(%L,'general','[1]')$$, :'org'), 'no válidos');
select public.t_err(format($$select public.cxp_prefs_guardar(%L,'general', jsonb_build_object('x', repeat('a', 21000)))$$, :'org'), 'demasiado grandes');

-- Restablecer solo borra lo propio
select public.cxp_prefs_restablecer(:'org'::uuid,'hoja_pendiente');
select public.t_eq('A restablece lo suyo', (select (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente') is null)::text), 'true');
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_eq('C conserva lo suyo', (public.cxp_prefs_obtener(:'org'::uuid,'hoja_pendiente'))->>'congelar', '1');
reset role;
\echo CXP_PREFS_OK
