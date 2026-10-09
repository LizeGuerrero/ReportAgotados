\set ON_ERROR_STOP 1
create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin begin execute p_sql; exception when others then
  if sqlerrm ilike '%'||p_like||'%' then raise notice 'ok  bloqueado [%]', p_like; return; end if;
  raise exception 'ERROR DISTINTO [%]: %', p_like, sqlerrm; end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql; end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);  -- A = propietaria
select public.crear_organizacion('Prop Org','PROP-1111') as slug \gset
reset role;
select id as org, propietario_id::text as prop from public.organizaciones where slug=:'slug' \gset
select public.t_eq('creador queda como propietario', :'prop', '00000000-0000-0000-0000-0000000000a1');
select id as r_admin from public.roles where organizacion_id=:'org'::uuid and nombre='admin' \gset
select id as r_com   from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as r_view  from public.roles where organizacion_id=:'org'::uuid and nombre='viewer' \gset
select id as mid_a from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000a1' and organizacion_id=:'org'::uuid \gset

-- B y C entran por solicitud; A los acepta (B como admin, C como Comercial)
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('PROP-1111');
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false); select public.solicitar_union('PROP-1111');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org'::uuid \gset
select id as mid_c from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000c3' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid, true, :'r_admin'::uuid, null);
select public.resolver_solicitud(:'mid_c'::uuid, true, :'r_com'::uuid, null);

-- B (admin NO propietario)
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_a',:'r_com'),'rol del propietario');
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_a',:'r_admin'||''),'__nada__') where false;
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_b',:'r_com'),'propio rol');
select public.cambiar_rol_miembro(:'mid_c'::uuid, :'r_admin'::uuid, null);     -- promover a admin: permitido a cualquier admin
\echo ok  admin no propietario puede PROMOVER a admin
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_c',:'r_com'),'Solo el propietario puede quitar');
-- A (propietaria) sí puede quitarlo
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_rol_miembro(:'mid_c'::uuid, :'r_com'::uuid, null);
\echo ok  propietaria puede quitar el rol admin
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_a',:'r_com'),'propio rol');

-- Transferencia
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.transferir_propiedad(%L,%L)$$,:'org','00000000-0000-0000-0000-0000000000b2'),'Solo el propietario puede transferir');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.transferir_propiedad(%L,%L)$$,:'org','00000000-0000-0000-0000-0000000000a1'),'Ya eres el propietario');
select public.t_err(format($$select public.transferir_propiedad(%L,%L)$$,:'org','00000000-0000-0000-0000-0000000000c3'),'administradora activa');   -- C es Comercial
select public.t_err(format($$select public.transferir_propiedad(%L,%L)$$,:'org','00000000-0000-0000-0000-0000000000d4'),'administradora activa');   -- D ni es miembro
select public.transferir_propiedad(:'org'::uuid,'00000000-0000-0000-0000-0000000000b2'::uuid);
reset role;
select public.t_eq('B es el nuevo propietario', (select propietario_id::text from public.organizaciones where id=:'org'::uuid), '00000000-0000-0000-0000-0000000000b2');
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_b',:'r_com'),'rol del propietario');   -- A ya no manda
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.cambiar_rol_miembro(:'mid_a'::uuid, :'r_com'::uuid, null);                                            -- B ahora sí puede degradar a A
\echo ok  nuevo propietario puede quitar el rol admin a la anterior

-- Trigger: un admin no puede cambiar propietario_id desde el navegador (UPDATE directo)
select public.t_err(format($$update public.organizaciones set propietario_id=%L where id=%L$$,'00000000-0000-0000-0000-0000000000c3',:'org'),'solo se cambia con la función');
select public.t_err(format($$update public.organizaciones set propietario_id=null where id=%L$$,:'org'),'solo se cambia con la función');
update public.organizaciones set nombre='Prop Org 2' where id=:'org'::uuid;
reset role;
select public.t_eq('editar el nombre sigue funcionando', (select nombre from public.organizaciones where id=:'org'::uuid), 'Prop Org 2');
select public.t_eq('propietario intacto tras intentos', (select propietario_id::text from public.organizaciones where id=:'org'::uuid), '00000000-0000-0000-0000-0000000000b2');

-- Organización sin propietario (anterior a la migración): se comporta como antes
update public.organizaciones set propietario_id = null where id=:'org'::uuid;   -- como dueño de la base, no como "authenticated"
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.cambiar_rol_miembro(:'mid_a'::uuid, :'r_admin'::uuid, null);      -- B promueve a A
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_rol_miembro(:'mid_b'::uuid, :'r_com'::uuid, null);        -- sin propietario: cualquier admin puede degradar (como antes)
\echo ok  sin propietario: reglas anteriores (admin puede degradar a otro admin)
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_a',:'r_com'),'propio rol');
select public.t_err(format($$select public.transferir_propiedad(%L,%L)$$,:'org','00000000-0000-0000-0000-0000000000b2'),'Solo el propietario puede transferir');
reset role;
\echo PROPIETARIO_OK
