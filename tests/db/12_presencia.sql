\set ON_ERROR_STOP 1
-- Presencia en tiempo real: solo los miembros ACTIVOS de una organización entran a su canal.
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

-- A crea la organización 1; C crea la organización 2 (otra empresa)
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Org Uno','UNO-1111') as slug1 \gset
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.crear_organizacion('Org Dos','DOS-2222') as slug2 \gset
reset role;
select id as org1 from public.organizaciones where slug=:'slug1' \gset
select id as org2 from public.organizaciones where slug=:'slug2' \gset
select id as r_com from public.roles where organizacion_id=:'org1'::uuid and nombre='Comercial' \gset

-- B se une a la organización 1 y A la acepta; D solicita pero queda pendiente
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('UNO-1111');
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false); select public.solicitar_union('UNO-1111');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org1'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid, true, :'r_com'::uuid, null);
reset role;

select 'presencia:'||:'org1' as t1 \gset
select 'presencia:'||:'org2' as t2 \gset

-- ---- Interpretación del tema (solo la forma exacta presencia:<uuid>)
select public.t_eq('tema válido -> uuid de la organización', public.org_de_topico_presencia(:'t1')::text, :'org1');
select public.t_eq('tema sin uuid -> null', coalesce(public.org_de_topico_presencia('presencia:abc')::text,'null'), 'null');
select public.t_eq('tema con sufijo -> null', coalesce(public.org_de_topico_presencia(:'t1'||'x')::text,'null'), 'null');
select public.t_eq('tema con otro prefijo -> null', coalesce(public.org_de_topico_presencia('otro:'||:'org1')::text,'null'), 'null');
select public.t_eq('tema con mayúsculas/espacios -> null', coalesce(public.org_de_topico_presencia(' '||:'t1')::text,'null'), 'null');
select public.t_eq('tema nulo -> null', coalesce(public.org_de_topico_presencia(null)::text,'null'), 'null');

-- ---- Quién puede usar el canal
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_eq('A (propietaria org 1) entra a su canal', public.puede_usar_presencia(:'t1')::text, 'true');
select public.t_eq('A NO entra al canal de la org 2', public.puede_usar_presencia(:'t2')::text, 'false');
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('B (miembro activo org 1) entra', public.puede_usar_presencia(:'t1')::text, 'true');
select public.t_eq('B NO entra al canal de la org 2', public.puede_usar_presencia(:'t2')::text, 'false');
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_eq('C (org 2) NO entra al canal de la org 1', public.puede_usar_presencia(:'t1')::text, 'false');
select public.t_eq('C entra a su propio canal', public.puede_usar_presencia(:'t2')::text, 'true');
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false);
select public.t_eq('D (solicitud pendiente) NO entra', public.puede_usar_presencia(:'t1')::text, 'false');
select set_config('app.uid','',false);
select public.t_eq('sin sesión NO entra', public.puede_usar_presencia(:'t1')::text, 'false');
reset role;

-- B suspendido deja de ver y de publicar
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_estado_miembro(:'mid_b'::uuid, 'suspender');
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('B suspendido NO entra', public.puede_usar_presencia(:'t1')::text, 'false');
reset role;
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_estado_miembro(:'mid_b'::uuid, 'reactivar');
reset role;

-- ---- Políticas reales sobre realtime.messages (lo que Realtime evalúa al unirse y al publicar)
insert into realtime.messages(topic, extension) values (:'t1','presence'), (:'t2','presence');

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select set_config('realtime.topic',:'t1',false);
select public.t_eq('A recibe presencia de su canal', (select count(*) from realtime.messages where topic=:'t1' and extension='presence')::text, '1');
-- Realtime evalúa la política con el tema del canal al que se intenta entrar (realtime.topic()).
select set_config('realtime.topic',:'t2',false);
select public.t_eq('A NO recibe presencia del canal de la org 2', (select count(*) from realtime.messages where topic=:'t2')::text, '0');
do $$ begin
  begin
    insert into realtime.messages(topic, extension) values (current_setting('realtime.topic'), 'presence');
    raise exception 'DEBIO FALLAR: A publicó en el canal de otra organización';
  exception when insufficient_privilege then raise notice 'ok  A NO puede publicar en el canal de la org 2'; end;
end $$;
select set_config('realtime.topic',:'t1',false);
insert into realtime.messages(topic, extension) values (:'t1','presence');
\echo ok  A publica su presencia en su canal

select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select set_config('realtime.topic',:'t1',false);
select public.t_eq('C NO recibe presencia del canal de la org 1', (select count(*) from realtime.messages where topic=:'t1')::text, '0');
do $$ begin
  begin
    insert into realtime.messages(topic, extension) values (current_setting('realtime.topic'), 'presence');
    raise exception 'DEBIO FALLAR: C publicó en el canal de otra organización';
  exception when insufficient_privilege then raise notice 'ok  C NO puede publicar en el canal de la org 1'; end;
end $$;

select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select set_config('realtime.topic',:'t1',false);
do $$ begin
  begin
    insert into realtime.messages(topic, extension) values (current_setting('realtime.topic'), 'broadcast');
    raise exception 'DEBIO FALLAR: se permitió broadcast sin política';
  exception when insufficient_privilege then raise notice 'ok  la política solo abre "presence", no broadcast'; end;
end $$;
reset role;

-- Idempotencia: aplicar de nuevo la migración no falla ni duplica políticas
\i supabase/migrations/20261105210000_presencia_realtime.sql
select public.t_eq('2 políticas de presencia (sin duplicar)', (select count(*) from pg_policies where schemaname='realtime' and tablename='messages' and policyname like 'presencia:%')::text, '2');

\echo PRESENCIA_OK
