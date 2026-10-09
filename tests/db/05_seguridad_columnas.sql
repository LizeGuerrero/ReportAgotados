\set ON_ERROR_STOP 1
create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin begin execute p_sql; exception when others then
  if sqlerrm ilike '%'||p_like||'%' then raise notice 'ok  bloqueado [%]', p_like; return; end if;
  raise exception 'ERROR DISTINTO [%]: %', p_like, sqlerrm; end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql; end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

select set_config('app.role','authenticated',false);
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);   -- A: admin y propietaria
select public.crear_organizacion('Seguridad Org','SEGU-1111') as slug \gset
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);   -- C: admin de OTRA organización
select public.crear_organizacion('Otra Segura','SEGU-2222') as slug2 \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as org2 from public.organizaciones where slug=:'slug2' \gset
select created_at::text as org_creada from public.organizaciones where id=:'org'::uuid \gset

-- ==================== PROFILES ====================
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);   -- B
-- lo que la app hace hoy sigue permitido
update public.profiles set nombres='Beto Editado', apellidos='Nuevo', codigo_pais='+57', numero_celular='3001234567', foto_perfil='/x.png', username='beto2'
 where id=auth.uid();
select public.t_eq('editar los datos propios sigue permitido', (select nombres||'|'||username||'|'||numero_celular from public.profiles where id=auth.uid()), 'Beto Editado|beto2|3001234567');
-- lo que no
select public.t_err($$update public.profiles set activo=false where id=auth.uid()$$,'estado de tu cuenta');
select public.t_err($$update public.profiles set id=gen_random_uuid() where id=auth.uid()$$,'identificador del perfil');
select public.t_err($$update public.profiles set created_at=now()-interval '10 years' where id=auth.uid()$$,'fecha de creación');
select public.t_eq('la cuenta sigue activa', (select activo::text from public.profiles where id=auth.uid()), 'true');
-- perfil_completo: false -> true solo con los datos obligatorios (misma carga que CompleteProfileForm)
reset role;
update public.profiles set perfil_completo=false, username='' , nombres='' where id='00000000-0000-0000-0000-0000000000b2';
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err($$update public.profiles set perfil_completo=true where id=auth.uid()$$,'Completa nombres');
select public.t_err($$update public.profiles set perfil_completo=true, nombres='Beto', apellidos='X', tipo_documento='CC', numero_documento='222', username='   ' where id=auth.uid()$$,'Completa nombres');
update public.profiles set nombres='Beto', apellidos='Nuevo', tipo_documento='CC', numero_documento='222', username='beto', codigo_pais='+57', numero_celular='3001234567', perfil_completo=true where id=auth.uid();
select public.t_eq('completar el perfil con todos los datos funciona', (select perfil_completo::text from public.profiles where id=auth.uid()), 'true');
-- un perfil ya completo puede seguir editándose (no es la transición false->true)
update public.profiles set nombres='Beto Dos' where id=auth.uid();
select public.t_eq('perfil ya completo se sigue editando', (select nombres from public.profiles where id=auth.uid()), 'Beto Dos');
-- no puede tocar el perfil de otra persona (RLS) ni siquiera con campos permitidos
update public.profiles set nombres='HACK' where id='00000000-0000-0000-0000-0000000000a1';
reset role;
select public.t_eq('el perfil ajeno no cambió', (select nombres from public.profiles where id='00000000-0000-0000-0000-0000000000a1'), 'Ana');
-- service_role y postgres (SQL Editor / funciones del sistema) sí pueden
set role service_role;
update public.profiles set activo=false where id='00000000-0000-0000-0000-0000000000d4';
reset role;
select public.t_eq('service_role puede desactivar una cuenta', (select activo::text from public.profiles where id='00000000-0000-0000-0000-0000000000d4'), 'false');
update public.profiles set activo=true where id='00000000-0000-0000-0000-0000000000d4';
select public.t_eq('postgres (SQL Editor) también puede', (select activo::text from public.profiles where id='00000000-0000-0000-0000-0000000000d4'), 'true');

-- ==================== ORGANIZACIONES ====================
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);   -- A: admin de org1
update public.organizaciones set nombre='Seguridad Org SAS' where id=:'org'::uuid;
select public.t_eq('el admin puede renombrar (lo que hace PATCH /api/organizaciones)', (select nombre from public.organizaciones where id=:'org'::uuid), 'Seguridad Org SAS');
select public.t_err(format($$update public.organizaciones set slug='robado' where id=%L$$,:'org'),'slug');
select public.t_err(format($$update public.organizaciones set activo=false where id=%L$$,:'org'),'estado de la organización');
select public.t_err(format($$update public.organizaciones set identificacion='OTRO-9999' where id=%L$$,:'org'),'identificación');
select public.t_err(format($$update public.organizaciones set id=gen_random_uuid() where id=%L$$,:'org'),'identificador de la organización');
select public.t_err(format($$update public.organizaciones set created_at=now()+interval '1 year' where id=%L$$,:'org'),'fecha de creación');
select public.t_err(format($$update public.organizaciones set propietario_id=%L where id=%L$$,'00000000-0000-0000-0000-0000000000b2',:'org'),'solo se cambia con la función');
-- mezclar un cambio permitido con uno prohibido: se rechaza todo
select public.t_err(format($$update public.organizaciones set nombre='Mezcla', slug='mezcla' where id=%L$$,:'org'),'slug');
select public.t_eq('el cambio mezclado no se aplicó', (select nombre||'|'||slug from public.organizaciones where id=:'org'::uuid), 'Seguridad Org SAS|'||:'slug');
-- el admin de OTRA organización y un no miembro no pueden tocarla
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
update public.organizaciones set nombre='Intruso C' where id=:'org'::uuid;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
update public.organizaciones set nombre='Intruso B' where id=:'org'::uuid;
reset role;
select public.t_eq('nadie ajeno pudo renombrarla', (select nombre from public.organizaciones where id=:'org'::uuid), 'Seguridad Org SAS');
-- anon
set role anon;
update public.organizaciones set nombre='Anon' where id=:'org'::uuid;
reset role;
select public.t_eq('anon no pudo renombrarla', (select nombre from public.organizaciones where id=:'org'::uuid), 'Seguridad Org SAS');
-- una consulta sin sesión a roles devuelve vacío (no error): la política usa es_admin_org y anon puede ejecutarla
set role anon;
select public.t_eq('anon consulta roles: lista vacía, sin error', (select count(*)::text from public.roles), '0');
reset role;
-- service_role y postgres sí pueden (operaciones de soporte)
set role service_role;
update public.organizaciones set activo=false where id=:'org2'::uuid;
reset role;
select public.t_eq('service_role puede desactivar una organización', (select activo::text from public.organizaciones where id=:'org2'::uuid), 'false');
update public.organizaciones set activo=true, identificacion='SEGU-2222' where id=:'org2'::uuid;
select public.t_eq('postgres puede corregir datos', (select activo::text from public.organizaciones where id=:'org2'::uuid), 'true');

-- ==================== los triggers existen y no se pueden invocar por RPC ====================
reset role;
select public.t_eq('los triggers existen', (select count(*)::text from pg_trigger where tgname in ('profiles_proteger_columnas','organizaciones_proteger_columnas','organizaciones_proteger_propietario')), '3');
set role authenticated;
select public.t_err($$select public._trg_proteger_profiles()$$,'permission denied');
select public.t_err($$select public._trg_proteger_organizaciones()$$,'permission denied');
reset role;
\echo SEGURIDAD_OK
