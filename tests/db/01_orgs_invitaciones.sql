\set ON_ERROR_STOP 1
create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if sqlerrm ilike '%'||p_like||'%' then return; end if;
    raise exception 'ERROR DISTINTO al esperado [%]: %', p_like, sqlerrm;
  end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql;
end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;
create or replace function public.t_eq(p_label text, p_got boolean, p_exp boolean) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;
create or replace function public.t_eq(p_label text, p_got bigint, p_exp bigint) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

set role authenticated;
select set_config('app.role','authenticated',false);

-- ===== A crea organización
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Empresa XYZ Ñandú', '900.123.456-7') as slug \gset
select public.t_eq('slug generado', :'slug', 'empresa-xyz-nandu');
select public.t_err($$select public.crear_organizacion('Otra', '900123456-7')$$, 'Ya existe una organización con esa identificación');
select public.t_err($$select public.crear_organizacion('Otra', 'ab')$$, 'Identificación no válida');
select public.t_err($$select public.crear_organizacion('x', '12345678')$$, 'entre 3 y 120');
select id as org from public.organizaciones where slug = :'slug' \gset
select public.t_eq('A es admin activo', public.es_admin_org(:'org'::uuid), true);
select public.t_eq('A ve 6 roles de su org (RLS)', (select count(*) from public.roles where organizacion_id=:'org'::uuid), 6::bigint);
select public.t_eq('A tiene permiso pedidos', public.tiene_permiso(:'org'::uuid,'pedidos','ver'), true);
select public.t_eq('A tiene permiso Roles/crear', public.tiene_permiso(:'org'::uuid,'Roles','crear'), true);
select public.t_eq('A tiene sede asignada', (select sede_id is not null from public.membresias where usuario_id=auth.uid()), true);
reset role;
select public.t_eq('viewer sin permisos_rol', (select count(*) from public.permisos_rol p join public.roles r on r.id=p.rol_id where r.nombre='viewer' and r.organizacion_id=:'org'::uuid), 0::bigint);
select public.t_eq('admin con 9 módulos', (select count(*) from public.permisos_rol p join public.roles r on r.id=p.rol_id where r.nombre='admin' and r.organizacion_id=:'org'::uuid), 9::bigint);
select public.t_eq('Compras con 5', (select count(*) from public.permisos_rol p join public.roles r on r.id=p.rol_id where r.nombre='Compras' and r.organizacion_id=:'org'::uuid), 5::bigint);
select public.t_eq('Comercial con 2', (select count(*) from public.permisos_rol p join public.roles r on r.id=p.rol_id where r.nombre='Comercial' and r.organizacion_id=:'org'::uuid), 2::bigint);
select r.id as rol_comercial from public.roles r where r.nombre='Comercial' and r.organizacion_id=:'org'::uuid \gset
select r.id as rol_viewer from public.roles r where r.nombre='viewer' and r.organizacion_id=:'org'::uuid \gset
select r.id as rol_admin from public.roles r where r.nombre='admin' and r.organizacion_id=:'org'::uuid \gset
select id as sede from public.sedes where organizacion_id=:'org'::uuid \gset

-- ===== Escenario A: invitación directa con rol
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select encode(sha256(convert_to('token-prueba-1','UTF8')),'hex') as h1 \gset
select public.crear_invitacion(:'org'::uuid,'Nuevo@Demo.com',:'rol_comercial'::uuid,:'sede'::uuid,:'h1') as inv1 \gset
select public.t_err(format($$select public.crear_invitacion(%L,'x@y.com',%L,null,%L)$$,:'org',:'rol_comercial','zz'), 'Token no válido');
select public.t_eq('A ve 1 invitación pendiente', (select estado from public.listar_invitaciones(:'org'::uuid) limit 1), 'pendiente');
-- C (no admin) no puede invitar ni listar
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_err(format($$select public.crear_invitacion(%L,'x@y.com',%L,null,%L)$$,:'org',:'rol_comercial',:'h1'), 'Solo un administrador');
select public.t_err(format($$select * from public.listar_invitaciones(%L)$$,:'org'), 'Solo un administrador');
select public.t_err(format($$select * from public.listar_miembros(%L)$$,:'org'), 'Solo un administrador');
-- C intenta aceptar la invitación de B (enlace compartido) -> falla por correo
select public.t_err($$select public.aceptar_invitacion('token-prueba-1')$$, 'otro correo');
-- D con correo sin confirmar
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false);
select public.t_err($$select public.aceptar_invitacion('token-prueba-1')$$, 'Confirma tu correo');
-- sin sesión
select set_config('app.uid','',false);
select public.t_err($$select public.aceptar_invitacion('token-prueba-1')$$, 'No autenticado');
-- info pública (anon)
reset role; set role anon;
select public.t_eq('info anon valida', (select valida from public.info_invitacion('token-prueba-1')), true);
select public.t_eq('info anon correo', (select email from public.info_invitacion('token-prueba-1')), 'nuevo@demo.com');
select public.t_eq('info token falso', (select motivo from public.info_invitacion('nada')), 'no_existe');
select public.t_err($$select public.crear_organizacion('Anon Org','99999999')$$, 'permission denied');
reset role; set role authenticated;
-- B acepta
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('B acepta -> slug', public.aceptar_invitacion('token-prueba-1'), :'slug');
select public.t_eq('B reporte_agotados SI', public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver'), true);
select public.t_eq('B pedidos NO', public.tiene_permiso(:'org'::uuid,'pedidos','ver'), false);
select public.t_eq('B no es admin', public.es_admin_org(:'org'::uuid), false);
select public.t_err($$select public.aceptar_invitacion('token-prueba-1')$$, 'ya no está disponible');
select public.t_eq('B ve SOLO su rol (RLS roles)', (select count(*) from public.roles), 1::bigint);
select public.t_eq('B exigirRol-join ok', (select count(*) from public.membresias m join public.roles r on r.id=m.rol_id where m.usuario_id=auth.uid()), 1::bigint);
select public.t_eq('B ve su org (activa)', (select count(*) from public.organizaciones where slug=:'slug'), 1::bigint);
select public.t_err(format($$update public.membresias set rol_id=%L where usuario_id=auth.uid()$$,:'rol_admin') || '; select 1/0', 'division');  -- update no afecta filas (sin policy)
select public.t_eq('B NO pudo cambiarse el rol', (select r.nombre from public.membresias m join public.roles r on r.id=m.rol_id where m.usuario_id=auth.uid()), 'Comercial');
select public.t_err(format($$insert into public.membresias(usuario_id,organizacion_id,rol_id,estado_membresia) values (auth.uid(),%L,%L,'activa')$$,:'org',:'rol_admin'), 'row-level security');
select public.t_err($$select * from public.invitaciones$$, 'permission denied');
select public.t_err(format($$select public.cambiar_rol_miembro((select id from public.membresias where usuario_id=auth.uid()), %L)$$,:'rol_admin'), 'Solo un administrador');

-- ===== Invitación vencida
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select encode(sha256(convert_to('token-vencido','UTF8')),'hex') as h2 \gset
select public.crear_invitacion(:'org'::uuid,'otro@demo.com',:'rol_viewer'::uuid,null,:'h2') as inv2 \gset
reset role; update public.invitaciones set expira_en = now() - interval '1 minute' where id=:'inv2'::uuid; set role authenticated;
select public.t_eq('info vencida', (select motivo from public.info_invitacion('token-vencido')), 'vencida');
select public.t_eq('listar la marca vencida', (select estado from public.listar_invitaciones(:'org'::uuid) where id=:'inv2'::uuid), 'vencida');
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_err($$select public.aceptar_invitacion('token-vencido')$$, 'venció');
-- reenviar crea una nueva y cancela la previa
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select encode(sha256(convert_to('token-reenvio','UTF8')),'hex') as h3 \gset
select public.crear_invitacion(:'org'::uuid,'otro@demo.com',:'rol_viewer'::uuid,null,:'h3') as inv3 \gset
select public.t_eq('previa cancelada al reenviar', (select estado from public.listar_invitaciones(:'org'::uuid) where id=:'inv2'::uuid), 'cancelada');
select public.t_err(format($$select public.crear_invitacion(%L,'nuevo@demo.com',%L,null,%L)$$,:'org',:'rol_viewer',:'h3'), 'ya pertenece');
select public.cancelar_invitacion(:'inv3'::uuid);
select public.t_eq('cancelada', (select estado from public.listar_invitaciones(:'org'::uuid) where id=:'inv3'::uuid), 'cancelada');
select public.t_err(format($$select public.cancelar_invitacion(%L)$$,:'inv3'), 'ya no está pendiente');
-- rechazar
select encode(sha256(convert_to('token-rech','UTF8')),'hex') as h4 \gset
select public.crear_invitacion(:'org'::uuid,'otro@demo.com',:'rol_viewer'::uuid,null,:'h4') as inv4 \gset
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.rechazar_invitacion('token-rech');
select public.t_eq('rechazada', (select motivo from public.info_invitacion('token-rech')), 'rechazada');

-- ===== Escenario B / solicitudes sin invitación
select public.t_eq('solicitar por NIT', public.solicitar_union('900123456-7'), 'Empresa XYZ Ñandú');
select public.t_err($$select public.solicitar_union('900123456-7')$$, 'Ya enviaste');
select public.t_err($$select public.solicitar_union('no-existe-9999')$$, 'No encontramos');
select public.t_eq('mis_solicitudes', (select count(*) from public.mis_solicitudes()), 1::bigint);
select public.t_eq('pendiente SIN permisos', public.tiene_permiso(:'org'::uuid,'pedidos','ver') or public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver'), false);
select public.t_eq('pendiente NO ve la org (RLS)', (select count(*) from public.organizaciones where slug=:'slug'), 0::bigint);
select public.t_eq('pendiente no es admin', public.es_admin_org(:'org'::uuid), false);
select public.t_err(format($$select public.resolver_solicitud((select id from public.membresias where usuario_id=auth.uid()), true, %L, null)$$,:'rol_admin'), 'Solo un administrador');
-- admin ve la solicitud, la acepta como Predeterminado
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select membresia_id as mid from public.listar_miembros(:'org'::uuid) where email='otro@demo.com' and estado='pendiente' \gset
select public.t_eq('solicitud trae cédula', (select numero_documento from public.listar_miembros(:'org'::uuid) where membresia_id=:'mid'::uuid), '333');
select public.resolver_solicitud(:'mid'::uuid, true, null, null);
select public.t_eq('aceptada=viewer activa', (select rol_nombre||'/'||estado from public.listar_miembros(:'org'::uuid) where membresia_id=:'mid'::uuid), 'viewer/activa');
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_eq('viewer sigue SIN módulos', public.tiene_permiso(:'org'::uuid,'pedidos','ver') or public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver'), false);
select public.t_eq('viewer ve nombre de su org', (select count(*) from public.organizaciones where slug=:'slug'), 1::bigint);
-- admin le da Comercial + sede
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_rol_miembro(:'mid'::uuid, :'rol_comercial'::uuid, :'sede'::uuid);
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_eq('ahora Comercial: acceso', public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver'), true);
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_rol_miembro(:'mid'::uuid, :'rol_viewer'::uuid, null);
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_eq('de vuelta a Predeterminado: sin acceso', public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver'), false);
-- rechazo
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
reset role; update public.membresias set estado_membresia='retirada', activo=false where usuario_id='00000000-0000-0000-0000-0000000000b2'; set role authenticated;
select public.t_eq('re-solicitud tras retirada', public.solicitar_union('empresa-xyz-nandu'), 'Empresa XYZ Ñandú');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select membresia_id as mid2 from public.listar_miembros(:'org'::uuid) where email='nuevo@demo.com' and estado='pendiente' \gset
select public.resolver_solicitud(:'mid2'::uuid, false, null, null);
reset role;
select public.t_eq('rechazada=retirada', (select estado_membresia::text||'/'||activo::text from public.membresias where id=:'mid2'::uuid), 'retirada/false');
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_eq('rechazados no salen en listado', (select count(*) from public.listar_miembros(:'org'::uuid) where membresia_id=:'mid2'::uuid), 0::bigint);
select public.t_err(format($$select public.resolver_solicitud(%L,true,null,null)$$,:'mid2'), 'ya fue resuelta');

-- ===== Un admin no puede dejar la org sin admin
select id as mid_admin from public.membresias where usuario_id=auth.uid() and organizacion_id=:'org'::uuid \gset
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_admin',:'rol_comercial'), 'No puedes cambiar tu propio rol');
-- cambiar solo su sede sí se puede
select public.cambiar_rol_miembro(:'mid_admin'::uuid, :'rol_admin'::uuid, :'sede'::uuid);
-- con un segundo admin: A no puede degradarse, pero el otro admin sí puede degradar a A
reset role;
select id as mid_c1 from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000c3' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_rol_miembro(:'mid_c1'::uuid, :'rol_admin'::uuid, null);
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_c1',:'rol_viewer'), 'No puedes cambiar tu propio rol');
-- C (admin NO propietario) no puede degradar a A (propietaria): regla nueva
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_admin',:'rol_comercial'), 'rol del propietario');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_eq('A sigue admin', public.es_admin_org(:'org'::uuid), true);
-- A (propietaria) sí puede quitar el rol admin a C
select public.cambiar_rol_miembro(:'mid_c1'::uuid, :'rol_viewer'::uuid, null);

-- ===== Aislamiento entre organizaciones: C crea SU org; A (admin de la otra) no puede tocarla
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.crear_organizacion('Otra Empresa', 'NIT-77777') as slug2 \gset
select id as org2 from public.organizaciones where slug=:'slug2' \gset
select r.id as rol_org2 from public.roles r where r.organizacion_id=:'org2'::uuid and r.nombre='admin' \gset
select id as mid_c from public.membresias where usuario_id=auth.uid() and organizacion_id=:'org2'::uuid \gset
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_eq('A no es admin de org2', public.es_admin_org(:'org2'::uuid), false);
select public.t_eq('A no ve roles de org2', (select count(*) from public.roles where organizacion_id=:'org2'::uuid), 0::bigint);
select public.t_err(format($$select * from public.listar_miembros(%L)$$,:'org2'), 'Solo un administrador');
select public.t_err(format($$select public.crear_invitacion(%L,'z@z.com',%L,null,%L)$$,:'org2',:'rol_org2',:'h1'), 'Solo un administrador');
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_c',:'rol_org2'), 'Solo un administrador');
-- A (admin de org1) intenta asignar un rol de org2 a un miembro de org1
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid'||'',:'rol_org2'), 'no pertenece a esta organización');
select public.t_err(format($$select public.crear_invitacion(%L,'z@z.com',%L,null,%L)$$,:'org',:'rol_org2',:'h1'), 'no pertenece a esta organización');
-- el mismo usuario puede estar en dos organizaciones (C: admin de org2 y viewer de org1) con permisos separados
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_eq('C admin en org2', public.es_admin_org(:'org2'::uuid), true);
select public.t_eq('C NO admin en org1', public.es_admin_org(:'org'::uuid), false);
select public.t_eq('C sin pedidos en org1', public.tiene_permiso(:'org'::uuid,'pedidos','ver'), false);
select public.t_eq('C con pedidos en org2', public.tiene_permiso(:'org2'::uuid,'pedidos','ver'), true);
reset role;
select public.t_eq('cédula única (índice)', (select count(*) from pg_indexes where indexname='profiles_documento_key'), 1::bigint);
select public.t_err($$insert into public.profiles(id,tipo_documento,numero_documento,username) select id,'CC','111','dup' from auth.users where email='sinconfirmar@demo.com' on conflict (id) do update set numero_documento='111'$$, 'profiles_documento_key');
\echo TODAS_LAS_PRUEBAS_OK
